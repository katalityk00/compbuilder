import raw from "@/data/lol-data.json";
import type { LolData } from "./compo";

export const data = raw as unknown as LolData;
