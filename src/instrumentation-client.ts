import { initBotId } from "botid/client/core";

// Rotas chamadas pelo próprio front-end que custam dinheiro (modelo) ou criam sessão.
initBotId({
  protect: [
    { path: "/api/auth", method: "POST" },
    { path: "/api/chat", method: "POST" },
  ],
});
