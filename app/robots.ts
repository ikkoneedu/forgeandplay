import type { MetadataRoute } from "next";

/** KO Ekip özel (davetli) bir uygulama: arama motorları ve yapay zekâ tarayıcıları dizinlemesin. */
export default function robots(): MetadataRoute.Robots {
  const ai = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
    "PerplexityBot", "Perplexity-User", "Google-Extended", "GoogleOther", "CCBot", "Bytespider", "Amazonbot",
    "Applebot-Extended", "meta-externalagent", "FacebookBot", "cohere-ai", "Diffbot", "MistralAI-User", "DuckAssistBot"];
  return {
    rules: [
      ...ai.map((userAgent) => ({ userAgent, disallow: "/" })),
      { userAgent: "*", disallow: "/" },
    ],
  };
}
