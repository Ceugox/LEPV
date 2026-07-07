# Guia de Identidade Visual e Paleta de Cores: LEPV SP — Missão Empreendedora

Este documento apresenta a proposta de identidade visual e paleta de cores direcionada ao desenvolvimento do site oficial da **LEPV SP - Missão Empreendedora**. O conceito visual foi extraído diretamente do logotipo fornecido, garantindo consistência de marca, modernidade e alto impacto para o público empreendedor.

---

## 1. Conceito e Essência da Marca
O logotipo traz uma forte conexão de ponte e movimento (representada pelo avião, pela Ponte Estaiada de São Paulo e pelo Pão de Açúcar com o Bondinho no Rio de Janeiro). A marca expressa **conectividade, dinamismo, liderança e expansão de negócios**. 

A presença do vermelho em formato de pincelada contrasta com a sobriedade do azul marinho, transmitindo a paixão e a ousadia do empreendedorismo combinadas com a segurança e o profissionalismo corporativo.

---

## 2. Paleta de Cores Oficial

### Cores Primárias (Dominantes)
* **Azul Marinho Corporativo (`#081B33`)**
    * *Uso no site:* Planos de fundo de seções principais (Hero, Rodapé), cabeçalhos e textos de alta importância. Transmite confiança, estabilidade e autoridade.
* **Branco Puro (`#FFFFFF`)**
    * *Uso no site:* Fundo de páginas de leitura, blocos de conteúdo e tipografia sobre o fundo escuro. Garante contraste e excelente legibilidade.

### Cores Secundárias e de Destaque (Accent Colors)
* **Vermelho Impacto (`#D31E24`)**
    * *Uso no site:* Botões de Ação (CTAs - *Call to Action*), links importantes, badges, destaques de conversão e elementos interativos. Representa energia, urgência e atitude empreendedora.
* **Cinza Gelo / Off-White (`#F5F7FA`)**
    * *Uso no site:* Fundos alternados de seções (zebra striping), cards de conteúdo secundário e bordas sutis. Evita o cansaço visual do branco puro.

### Cores de Apoio (Texto e Detalhes)
* **Cinza Grafite (`#334155`)**
    * *Uso no site:* Cor principal para textos longos (parágrafos) sobre fundo claro, garantindo uma leitura confortável e moderna (menos agressiva que o preto puro).

---

## 3. Tipografia Recomendada para a Web

Para alinhar-se ao estilo robusto e geométrico do logotipo, a recomendação de fontes gratuitas (Google Fonts) é:

* **Títulos (H1, H2, H3):** `Montserrat` ou `Barlow Condensed` (em caixa alta / Bold ou Black).
    * *Justificativa:* Reflete a força, o peso e a inclinação moderna da tipografia "LEPV" do logo.
* **Texto Corrido (Parágrafos e Listas):** `Inter` ou `Open Sans` (Regular 400 / Medium 500).
    * *Justificativa:* Fontes extremamente limpas, com excelente legibilidade em telas de qualquer tamanho (mobile e desktop).

---

## 4. Aplicação Prática dos Elementos na Interface (UI)

### Cabeçalho (Navbar)
* **Fundo:** Azul Marinho Corporativo ou Branco Fixo com sombra suave.
* **Links de Navegação:** Cinza Grafite ou Branco (se fundo escuro), com efeito *hover* em Vermelho Impacto.
* **Botão Principal (Inscrição/Contato):** Fundo Vermelho Impacto com texto Branco.

### Seção Hero (Abertura do Site)
* **Fundo:** Azul Marinho Corporativo profundo com uma sutil textura geométrica ou imagem em marca d'água (skyline SP/RJ).
* **Título Principal:** Branco com palavras-chave em Vermelho Impacto.
* **Botão de CTA:** Vermelho Impacto com efeito de brilho ou transição suave ao passar o mouse.

### Seções de Conteúdo (Sobre a Missão, Cronograma, Palestrantes)
* Alternar fundos entre **Branco Puro** e **Cinza Gelo** para criar ritmo visual.
* Utilizar cards com bordas levemente arredondadas e uma sombra bem suave (`box-shadow`) para dar profundidade.

### Rodapé (Footer)
* **Fundo:** Azul Marinho Corporativo (o mesmo tom escuro do logotipo).
* **Conteúdo:** Logotipo em versão simplificada, links institucionais em branco fosco e ícones de redes sociais.

---

## 5. Amostra de Estilos CSS (Para Desenvolvedores)

```css
:root {
  --primary-dark: #081b33;
  --accent-red: #d31e24;
  --bg-light: #f5f7fa;
  --text-dark: #334155;
  --text-light: #ffffff;
  
  --font-headings: 'Montserrat', sans-serif;
  --font-body: 'Inter', sans-serif;
}

body {
  font-family: var(--font-body);
  color: var(--text-dark);
  background-color: #ffffff;
}

h1, h2, h3 {
  font-family: var(--font-headings);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--primary-dark);
}

.btn-primary {
  background-color: var(--accent-red);
  color: var(--text-light);
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  font-weight: bold;
  transition: background 0.3s ease;
}

.btn-primary:hover {
  background-color: #b5151a; /* Tom ligeiramente mais escuro para o hover */
  cursor: pointer;
}