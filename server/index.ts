import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 8787);
createApp(process.env.HANDBACK_DB).listen(port, () => {
  console.log(`Handback API on http://localhost:${port}`);
});
