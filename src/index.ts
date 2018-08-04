import chalk from "chalk"
import * as Discord from "discord.js"
import { Room } from "node-ncc-es6"
import * as readline from "readline"
import * as request from "request-promise-native"
import Runtime from "./discord/runtime"
import Log from "./log"
import Ncc from "./ncc/ncc"
import Cafe from "./ncc/structure/cafe"
import NcChannel from "./ncc/talk/ncchannel"
import uploadImage from "./ncc/talk/uploadphoto"

let run:Runtime
async function start() {
    run = new Runtime()
    run.on("restart",async () => {
        run.removeAllListeners("restart")
        await run.destroy()
        Log.d("Main", "Restarting Runtime...")
        setTimeout(start, 2000)
    })
    await run.start()
}
Log.hook()
// start();
init()


async function init() {
    /*
    run = new Runtime();
    await run.start();
    */
    const ncc = new Ncc()
    const loaded = await ncc.loadCredit().then((value) => value != null ? value : ncc.genCreditByConsole())
    if (loaded != null) {
        Log.d(`name: ${loaded}`)
        // const ar = await ncc.getArticleDetail(26686242, 7382);
        if (ncc.available) {
            try {
                await ncc.fetchChannels()
                await ncc.testChannel(106977317649)
                await ncc.getOpenChannels(26686242)
                ncc.connect(true)
                // const captcha = await ncc.genCaptchaByConsole()
                // tslint:disable-next-line
                // const image = await uploadImage(ncc["credit"], "https://media.discordapp.net/attachments/152746825806381056/474758951171522560/unknown.png", "test.png")
                // tslint:disable-next-line
                // const channel = await ncc.createOpenChannel(26686242, captcha, "Hello", "World", image.path)
                // await channel.leave()
                // await Log.image(image.path, "Uploaded")
                // Log.json("Test",image)
                Log.time()
            } catch (err) {
                Log.e(err)
            }
        }
    }
}
// init();