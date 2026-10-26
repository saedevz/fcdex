import type { Client } from "discord.js";
import type { FCDexPackage } from "../loader.js";

const clubsPackage: FCDexPackage = {
  name: "clubs",

  async register(client: Client) {
    console.log(
      `[Clubs] Ready as ${client.user?.tag ?? "FCDex"}`,
    );

    // Club spawning, catching, and button handlers will be added here.
  },
};

export default clubsPackage;
