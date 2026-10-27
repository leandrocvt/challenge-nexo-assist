export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Nexo Assist</h1>
      <p>
        A interface ainda não reproduz o protótipo. Esta página não imita as
        telas do Pencil.
      </p>
      <p>
        O login grava um cookie httpOnly. O atendimento pausa o agent,
        guarda rascunho e só grava chamado na confirmação. Com
        OPENAI_API_KEY, o Mastra lê artigos e chamados.
      </p>
    </main>
  );
}
