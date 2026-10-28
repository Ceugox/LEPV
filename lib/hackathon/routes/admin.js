// Organização: pessoas, papéis, links de acesso e programação.
// Só a diretoria (perms.manage) mexe aqui.
const { route, requireBody, waLink } = require("../util");
const {
  HackError,
  adminView,
  newPerson,
  findPerson,
  findByEmail,
  normEmail,
  cleanText,
  addRole,
  dropRole,
  canAccess,
  CONTACT_FIELDS,
  validEmail,
} = require("../people");
const { issueLoginToken, revokeAllTokens, linkUrl } = require("../access");
const { clearPassword } = require("../password");
const { validateActivity, programView, venuesOf, updateVenue } = require("../program");
const { id } = require("../store");
const { sendAccessLink } = require("./access");
const T = require("../teams");
const RM = require("../removal");
const { LINK_TTL_MS } = require("../access");

// Papéis que a diretoria atribui à mão. "participant" vem só da inscrição;
// "sponsor"/"supporter" vêm da aprovação de parceiro (com organização).
const MANUAL_ROLES = ["judge", "staff"];

const manage = (p) => p.manage;

module.exports = function registerAdmin(app, ctx) {
  const people = () => ctx.store.get().people;

  app.get(
    "/hack/api/admin/people",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.sync();
      const s = ctx.store.get();
      res.json({
        // Bloqueados aparecem (marcados): é de onde se desbloqueia.
        // removable: a mesma regra da exclusão, para o painel não ter a sua.
        people: s.people.map((p) => Object.assign(adminView(p), { removable: RM.canRemove(s, p.id) })),
        orgs: s.orgs,
        emailEnabled: ctx.mail.emailEnabled(),
        bulk: Object.assign({}, bulk),
      });
    })
  );

  // Cria jurado ou staff. Se o e-mail já existe (ex.: jurado que também se
  // inscreveu), acrescenta o papel na mesma pessoa em vez de duplicar.
  app.post(
    "/hack/api/admin/people",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const name = cleanText(b.name, 80);
      const email = normEmail(b.email);
      const roles = Array.isArray(b.roles) ? b.roles.filter((r) => MANUAL_ROLES.includes(r)) : [];
      if (name.length < 3) throw new HackError(400, "invalid_name", "Informe o nome.");
      if (!validEmail(email)) throw new HackError(400, "invalid_email", "Informe um e-mail válido.");
      if (!roles.length) throw new HackError(400, "invalid_roles", "Escolha jurado ou staff.");
      const person = ctx.store.mutate((s) => {
        let p = findByEmail(s, email);
        if (p && p.disabled) throw new HackError(409, "disabled", "Essa pessoa está bloqueada. Desbloqueie em Editar antes.");
        if (!p) {
          p = newPerson({ email });
          s.people.push(p);
        }
        // O e-mail é a identidade; o contato é o que a diretoria digitou agora.
        // Se o registro veio de uma inscrição pública (que ninguém confere),
        // nome e telefone dela NÃO valem para um jurado/staff: senão quem se
        // inscreveu antes com o e-mail do jurado receberia o link dele no WhatsApp.
        p.name = name;
        p.phone = cleanText(b.phone, 30);
        p.manual = CONTACT_FIELDS.slice();
        // Links, sessões e senha que esse registro já tinha não sobrevivem à
        // promoção: a senha pode ter sido criada por quem se inscreveu com o
        // e-mail do jurado.
        revokeAllTokens(s, p.id, ctx.now());
        p.sessionEpoch += 1;
        clearPassword(p);
        roles.forEach((r) => addRole(p, r));
        if (b.affiliation !== undefined) p.affiliation = cleanText(b.affiliation, 80);
        if (b.staffPerms) {
          p.staffPerms = { comms: b.staffPerms.comms === true, checkin: b.staffPerms.checkin === true };
        }
        return p;
      });
      res.json({ person: adminView(person) });
    })
  );

  app.patch(
    "/hack/api/admin/people/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = requireBody(req);
      const person = ctx.store.mutate((s) => {
        const p = findPerson(s, req.params.id);
        if (!p) throw new HackError(404, "not_found", "Pessoa não encontrada.");
        if (b.name !== undefined) {
          const n = cleanText(b.name, 80);
          if (n.length < 3) throw new HackError(400, "invalid_name", "Informe o nome.");
          p.name = n;
        }
        if (b.email !== undefined) {
          const e = normEmail(b.email);
          if (!validEmail(e)) throw new HackError(400, "invalid_email", "Informe um e-mail válido.");
          const other = findByEmail(s, e);
          if (other && other.id !== p.id) throw new HackError(409, "email_taken", "Outra pessoa já usa este e-mail.");
          // Link já mandado para o endereço errado deixa de valer, e quem
          // entrou por ele (com a senha que criou) sai.
          if (e !== p.email) {
            revokeAllTokens(s, p.id, ctx.now());
            p.sessionEpoch += 1;
            clearPassword(p);
          }
          p.email = e;
        }
        if (b.phone !== undefined) p.phone = cleanText(b.phone, 30);
        // O que a diretoria corrigiu a inscrição não desfaz.
        p.manual = Array.from(new Set((p.manual || []).concat(CONTACT_FIELDS.filter((k) => b[k] !== undefined))));
        if (b.affiliation !== undefined) p.affiliation = cleanText(b.affiliation, 80);
        if (b.roles && typeof b.roles === "object") {
          for (const r of MANUAL_ROLES) {
            if (b.roles[r] === true) addRole(p, r);
            if (b.roles[r] === false) dropRole(p, r);
          }
        }
        if (b.staffPerms && typeof b.staffPerms === "object") {
          p.staffPerms = {
            comms: b.staffPerms.comms === undefined ? p.staffPerms.comms : b.staffPerms.comms === true,
            checkin: b.staffPerms.checkin === undefined ? p.staffPerms.checkin : b.staffPerms.checkin === true,
          };
        }
        if (b.disabled !== undefined) {
          p.disabled = b.disabled === true;
          if (p.disabled) {
            // Bloquear tira tudo: sessões, links pendentes, senha e notificações.
            // Sem apagar a senha, desbloquear devolveria o acesso a quem tinha
            // tomado a conta.
            p.sessionEpoch += 1;
            revokeAllTokens(s, p.id, ctx.now());
            clearPassword(p);
            s.pushSubs = s.pushSubs.filter((x) => x.personId !== p.id);
            T.prune(s, ctx.now());
          }
        }
        return p;
      });
      res.json({ person: adminView(person) });
    })
  );

  // Link de acesso gerado pela diretoria. send:"email" manda pelo e-mail;
  // sempre devolve a URL e o atalho do WhatsApp (contingência manual). A URL
  // só aparece nesta resposta: não fica guardada.
  app.post(
    "/hack/api/admin/people/:id/link",
    route(async (req, res) => {
      ctx.requireActor(req, manage);
      const b = req.body || {};
      const p = findPerson(ctx.store.get(), req.params.id);
      if (!canAccess(p)) throw new HackError(404, "not_found", "Pessoa sem acesso (bloqueada ou sem papel).");
      let url;
      let email = null;
      if (b.send === "email") {
        if (!p.email) throw new HackError(400, "no_email", "Esta pessoa não tem e-mail.");
        const r = await sendAccessLink(ctx, ctx.publicBase(req), p.id);
        url = r.url;
        email = r.result;
      } else {
        const raw = ctx.store.mutate((s) => issueLoginToken(s, p.id, ctx.now()));
        url = linkUrl(ctx.publicBase(req), raw);
      }
      const first = String(p.name).split(" ")[0];
      const whatsappUrl = waLink(
        p.phone,
        `Oi, ${first}! Aqui é a organização do 1º Hackathon LEPV. Seu link pessoal para a plataforma (vale ${Math.round(LINK_TTL_MS / 864e5)} dias, uso único, não compartilhe): ${url}`
      );
      res.json({ url, whatsappUrl, email });
    })
  );

  // Exclusão definitiva de participante: só o superadmin, confirmando com o
  // nome completo. A remoção no /hack roda antes numa cópia do estado: o que
  // ela recusaria (resultado travado, por exemplo) falha aqui, sem tocar no
  // evento. Só então a inscrição sai do evento (senão a sincronização
  // recriaria a pessoa). Quem já está "retirada" não tem inscrição a apagar:
  // a diretoria tirou a inscrição da lista, ou uma exclusão anterior parou
  // depois de apagá-la. Nos dois casos a exclusão segue só no /hack.
  app.delete(
    "/hack/api/admin/people/:id",
    route((req, res) => {
      const a = ctx.requireActor(req, (perm) => perm.superadmin);
      const b = req.body || {};
      ctx.sync();
      const p = RM.checkRemovable(ctx.store.get(), req.params.id);
      const typed = String(b.confirmName || "").trim().replace(/\s+/g, " ").toLowerCase();
      if (!typed || typed !== String(p.name).trim().replace(/\s+/g, " ").toLowerCase()) {
        throw new HackError(400, "confirm_name", "Digite o nome completo da pessoa para confirmar.");
      }
      RM.removePerson(JSON.parse(JSON.stringify(ctx.store.get())), req.params.id, ctx.now(), a.person.name);
      if (p.signupStatus !== "removed") {
        const ev = ctx.hackathonEvent();
        // Configuração faltando é defeito, não recusa: Error comum vai para o registro de falhas.
        if (!ev || !ctx.deps.removeEventSignup) throw new Error("exclusão de participante sem evento do hackathon ou sem removeEventSignup");
        ctx.deps.removeEventSignup(ev.id, p.signupId);
      }
      const r = ctx.store.mutate((s) => RM.removePerson(s, req.params.id, ctx.now(), a.person.name));
      // Quem saiu da fila de espera por causa da vaga aparece já confirmado.
      ctx.sync();
      res.json({ ok: true, removed: r.name });
    })
  );

  // Desconecta a pessoa de todos os aparelhos e invalida links pendentes.
  app.post(
    "/hack/api/admin/people/:id/revoke",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.store.mutate((s) => {
        const p = findPerson(s, req.params.id);
        if (!p) throw new HackError(404, "not_found", "Pessoa não encontrada.");
        // Desconectar também apaga a senha: senão ela entraria de novo na hora.
        p.sessionEpoch += 1;
        revokeAllTokens(s, p.id, ctx.now());
        clearPassword(p);
        s.pushSubs = s.pushSubs.filter((x) => x.personId !== p.id);
      });
      // Membro da liga entra pelo login do site, que não tem epoch daqui:
      // para ele, desconectar não basta — o painel avisa para bloquear.
      const p = findPerson(ctx.store.get(), req.params.id);
      if (p && p.memberOrder) {
        return res.json({ ok: true, warning: "Membro da liga continua entrando pelo login do site. Para tirar o acesso, use Bloquear." });
      }
      res.json({ ok: true });
    })
  );

  // Envio em lote do link por e-mail: só para quem ainda não recebeu nenhum
  // (ou para todos de um papel, com force). Roda em segundo plano, um por
  // vez, respeitando o limite do provedor; a lista de pessoas mostra o status.
  // Progresso do último envio em lote (o painel mostra; falhas por pessoa
  // ficam em lastLinkEmail).
  const bulk = { running: false, total: 0, done: 0, failed: 0, startedAt: null };
  app.post(
    "/hack/api/admin/links/bulk",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const b = req.body || {};
      if (!ctx.mail.emailEnabled()) {
        throw new HackError(409, "email_disabled", "Envio de e-mail não configurado. Use o link manual pelo WhatsApp.");
      }
      if (bulk.running) throw new HackError(409, "bulk_running", "Já existe um envio em lote em andamento.");
      const role = ["participant", "judge", "staff", "sponsor", "supporter"].includes(b.role) ? b.role : "participant";
      ctx.sync();
      const targets = people()
        .filter((p) => canAccess(p) && p.email && (p.roles.includes(role) || (role === "participant" && p.signupStatus === "waitlist" && b.waitlist === true)))
        // Padrão: só quem nunca recebeu link nenhum (nem manual, por WhatsApp):
        // um link novo revogaria o que a pessoa já tem em mãos.
        .filter((p) => b.force === true || !p.lastLinkAt)
        .map((p) => p.id);
      const base = ctx.publicBase(req);
      Object.assign(bulk, { running: true, total: targets.length, done: 0, failed: 0, startedAt: ctx.now().toISOString() });
      (async () => {
        for (const pid of targets) {
          try {
            const r = await sendAccessLink(ctx, base, pid);
            if (!["sent", "outbox"].includes(r.result.status)) bulk.failed += 1;
          } catch (err) {
            bulk.failed += 1;
            console.error("[hack] lote: falha para " + pid + ":", err.message);
          }
          bulk.done += 1;
          await new Promise((r) => setTimeout(r, 600));
        }
      })().finally(() => {
        bulk.running = false;
        if (bulk.failed) console.warn("[hack] lote terminou com " + bulk.failed + " falha(s) de " + bulk.total);
      });
      res.status(202).json({ queued: targets.length });
    })
  );

  // ---- Programação ----
  app.get(
    "/hack/api/admin/program",
    route((req, res) => {
      ctx.requireActor(req, manage);
      res.json({ program: programView(ctx.store.get(), { withOrgs: true }), orgs: ctx.store.get().orgs, venues: venuesOf(ctx.store.get()) });
    })
  );

  app.put(
    "/hack/api/admin/venues/:day",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const v = ctx.store.mutate((s) => updateVenue(s, req.params.day, requireBody(req)));
      res.json({ venue: v });
    })
  );

  app.post(
    "/hack/api/admin/program",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const a = ctx.store.mutate((s) => {
        const act = Object.assign({ id: id("a") }, validateActivity(requireBody(req), s));
        s.program.push(act);
        return act;
      });
      res.json({ activity: a });
    })
  );

  app.patch(
    "/hack/api/admin/program/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      const a = ctx.store.mutate((s) => {
        const act = s.program.find((x) => x.id === req.params.id);
        if (!act) throw new HackError(404, "not_found", "Atividade não encontrada.");
        Object.assign(act, validateActivity(Object.assign({}, act, requireBody(req)), s));
        return act;
      });
      res.json({ activity: a });
    })
  );

  app.delete(
    "/hack/api/admin/program/:id",
    route((req, res) => {
      ctx.requireActor(req, manage);
      ctx.store.mutate((s) => {
        const before = s.program.length;
        s.program = s.program.filter((x) => x.id !== req.params.id);
        if (s.program.length === before) throw new HackError(404, "not_found", "Atividade não encontrada.");
      });
      res.json({ ok: true });
    })
  );
};
