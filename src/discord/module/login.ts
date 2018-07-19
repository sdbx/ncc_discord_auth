import * as Discord from "discord.js";
import * as Hangul from "hangul-js";
import { sprintf } from "sprintf-js";
import Config from "../../config";
import Log from "../../log";
import Plugin from "../plugin";
import { MainCfg } from "../runtime";
import { ChainData, CommandHelp, CommandStatus, DiscordFormat, Keyword, ParamType, } from "../runutil";

export default class Login extends Plugin {
    // declare config file: use save data
    protected config = new LoginConfig();
    // declare command.
    private naverLogin:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.naverLogin = new CommandHelp("네이버 로그인", this.lang.sample.hello);
        // add parameter
        this.naverLogin.addField(ParamType.to,"네이버 아이디", false);
        // get parameter as complex
        this.naverLogin.complex = true;
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, options:Keyword[]):Promise<void> {
        // test command if match
        const lang = this.lang.login;
        const testNaver = this.naverLogin.test(command,options);
        if (testNaver.match && msg.channel.type === "dm") {
            // check naver status
            const _naverID = await this.ncc.validateLogin();
            if (_naverID != null) {
                // ok.
                await msg.channel.send(sprintf(lang.naverAlreadyOn, {id: _naverID}));
            } else {
                // set chain item
                const req = {
                    id: null as string,
                    pw: null as string,
                    captcha: null as string,
                }
                // optical param push
                if (testNaver.has(ParamType.to)) {
                    req.id = testNaver.get(ParamType.to);
                }
                // tell what to type
                const type = req.id == null ? "아이디" : "비밀번호";
                await msg.channel.send(sprintf(lang.naverRequest, {
                    type,
                    suffix: Hangul.endsWithConsonant(type) ? "을" : "를"
                }));
                // chain start
                this.startChain(msg.channel.id, msg.author.id, ChainType.NAVER, req);
                return Promise.resolve();
            }
        }
        return Promise.resolve();
    }
    /**
     * Receiving userid, password
     */
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        const typing = data.data as {id:string,pw:string,captcha:string};
        const content = message.content;
        const lang = this.lang.login;
        data.time = Date.now();
        // fill
        if (typing.id == null) {
            await message.channel.send(sprintf(lang.naverRequest, {
                type: "비밀번호",
                suffix: "를",
            }));
            typing.id = content;
        } else {
            // end chain
            typing.pw = content;
            const result = await this.ncc.requestCredent(typing.id,typing.pw).catch(Log.e);
            if (result != null) {
                await message.channel.send(lang.naverOn);
            } else {
                await message.channel.send(lang.naverOff);
            }
            return this.endChain(message,type,data);
        }
        return Promise.resolve(data);
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        // on receive all data
        const lang = this.lang.login;
        await message.reply(lang.passwordDelete);
        return Promise.resolve();
    }
}
class LoginConfig extends Config {
    public admins:string[] = [];
    constructor() {
        super("login");
    }
}
/**
 * Use ChainType for readability
 */
enum ChainType {
    NAVER,
}