import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`SplitFlow API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
