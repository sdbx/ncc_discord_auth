import * as Discord from "discord.js";
import * as fs from "fs-extra";
import * as Hangul from "hangul-js";
import * as request from "request-promise-native";
import { sprintf } from "sprintf-js";
import * as tmp from "tmp-promise";
import Config from "../../config";
import Log from "../../log";
import { LoginError } from "../../ncc/ncredent";
import Plugin from "../plugin";
import { GlobalCfg } from "../runtime";
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil";

export default class Login extends Plugin {
    // declare config file: use save data
    protected config = new LoginConfig();
    // declare command.
    private naverLogin:CommandHelp;
    // status
    private status:CommandHelp;
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready();
        // CommandHelp: suffix, description
        this.naverLogin = new CommandHelp("네이버 로그인", this.lang.sample.hello, true, {reqAdmin:true, dmOnly:true});
        // add parameter
        this.naverLogin.addField(ParamType.to,"네이버 아이디", false);
        // get parameter as complex
        this.naverLogin.complex = true;
        this.status = new CommandHelp("상태 알려", "상태 확인", true, {reqAdmin:true});
        return Promise.resolve();
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const lang = this.lang.login;
        const testNaver = this.naverLogin.check(this.global,command,state);
        /**
         * naver login
         * I don't have server with https or TLS.... sh**.
         * DO NOT FORGET ERASE PASSWORD
         */
        if (testNaver.match) {
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
        const _status = this.status.check(this.global,command,state);
        if (_status.match) {
            const send = new Discord.RichEmbed();
            const nState =
                await this.ncc.availableAsync() ? lang.naverOn : lang.naverOff;
            send.addField("네이버 로그인", nState);
            send.addField("봇 관리자 여부", this.toLangString(this.global.authUsers.indexOf(msg.author.id) >= 0));
            send.author = {
                name: msg.author.username,
                icon_url: msg.author.avatarURL,
            }
            await msg.channel.send(send);
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
        } else if (typing.pw == null || typing.captcha != null) {
            // end chain
            let captchaValue:{key:string,value:string} = null;
            if (typing.pw == null) {
                typing.pw = content;
            } else {
                captchaValue = {
                    key: typing.captcha,
                    value: content,
                }
            }
            const result:LoginError = await this.ncc.requestCredent(typing.id,typing.pw,captchaValue)
                .then((username) => null).catch((err) => err);
            if (result == null) {
                await message.reply(lang.naverOn + "\n" + lang.passwordDelete);
                // await message.channel.send(result.pwd ? lang.naverWrongPW : lang.naverOn);
                return this.endChain(message, type, data);
            } else {
                if (result.captcha) {
                    const url = result.captchaURL;
                    typing.captcha = url.substring(url.indexOf("key=") + 4, url.lastIndexOf("&"));
                    const image:Buffer = await request.get(url, {encoding:null});

                    const rich = new Discord.RichEmbed();
                    rich.setTitle(lang.naverReqCaptcha);
                    rich.attachFile(new Discord.Attachment(image,"captcha.png"));
                    rich.setImage("attachment://captcha.png");
                    await message.channel.send(rich);
                } else {
                    // pwd wrong
                    await message.channel.send(lang.naverWrongPW);
                    return this.endChain(message, type, data);
                }
            }    
        } else {
            // this should never happen.
            Log.w("WTF", "login.ts - onChainMessage");
            return this.endChain(message, type, data);
        }
        return Promise.resolve(data);
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        // on receive all data
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