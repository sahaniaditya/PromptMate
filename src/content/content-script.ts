import { chatgptAdapter } from "./adapters/chatgpt";
import { claudeAdapter } from "./adapters/claude";
import { geminiAdapter } from "./adapters/gemini";
import { genericAdapter } from "./adapters/generic";
import type { SiteAdapter } from "./adapters/adapter";
import { bootstrap } from "./injector";

const ADAPTERS: SiteAdapter[] = [chatgptAdapter, claudeAdapter, geminiAdapter];

function selectAdapter(url: string): SiteAdapter {
  return ADAPTERS.find((a) => a.matches(url)) ?? genericAdapter;
}

const adapter = selectAdapter(location.href);
bootstrap(adapter);
