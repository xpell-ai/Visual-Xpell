import { _x, _xlog, XNode, _xai, _xs, _xem } from "@xpell/node";
import { createExampleModule } from "@xpell/example-module";
import { createFoodProductLookupModule } from "@xpell/food-product-lookup";
import { XVibeModule } from "@xpell/vibe";
import { AimeProvider } from "@xpell/xai-providers/aime";
import { GeminiProvider } from "@xpell/xai-providers/gemini";
import "dotenv/config";

import { StarterModule } from "./modules/Starter/StarterModule.js";
import { XTestModule } from "./modules/Test/XTest.js";
import { installPackagedSystemXApps } from "./systemApps.js";



const work_folder = process.env.WORK_FOLDER || "./work";

async function main() {
  try {
    _x._verbose = true;
    _xlog._debug = true;
    const node = new XNode();
    const system_xapps = installPackagedSystemXApps({
      _work_folder: work_folder,
    });

    await node.start({
      _work_folder: work_folder,
      _system_xapps_path: system_xapps._runtime_root,
      _port: process.env.PORT ? Number(process.env.PORT) : undefined,
      _host: process.env.HOST,
      // _web_settings: {
      //   domain: "localhost",
      //   "http-port": 3000,
      //   "enable-wormhole": true
      // },
      _xdb: {
        _type: "fs"
      },
      _modules: [
        createExampleModule(),
        createFoodProductLookupModule(),
        new XVibeModule(),
        new StarterModule()
      ],
    });

    const apiKey =
      _xs.getPath(
        "xai.providers.aime.api_key"
      ) ||
      process.env.AIME_API_KEY ||
      "";

      
    _xai.registerProvider(
      "aime",
      new AimeProvider({
        endpoint: process.env.AIME_ENDPOINT!,
        apiKey
      })
    );

   
    await _x.execute({
      _module: "xai",
      _op: "set_default",
      _params: { _provider: "aime" },
    });

    
    


    await _x.loadModuleAsync(new XTestModule());


    _xlog.log("[vibe-server] ready");

  } catch (err) {
    _xlog.error("[vibe-server] fatal", err);
    process.exit(1);
  }
}

main();
