import "./style.css";

async function route(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app element");

  app.innerHTML = "";

  const pathname = window.location.pathname;
  const editMatch = pathname.match(/^\/edit\/([a-z0-9-]+)$/);
  const readMatch = pathname.match(/^\/n\/([a-z0-9-]+)$/);

  if (editMatch?.[1]) {
    const { mountEditView } = await import("./views/edit.js");
    await mountEditView(app, editMatch[1]);
  } else if (readMatch?.[1]) {
    const { mountReadView } = await import("./views/read.js");
    await mountReadView(app, readMatch[1]);
  } else {
    const { mountListView } = await import("./views/list.js");
    await mountListView(app);
  }
}

route();
