import * as Discord from "discord.js"
import * as fs from "fs-extra"
import * as Hangul from "hangul-js"
import * as request from "request-promise-native"
import { sprintf } from "sprintf-js"
import * as tmp from "tmp-promise"
import Config from "../../config"
import Log from "../../log"
import { LoginError } from "../../ncc/credit/ncredit"
import Plugin from "../plugin"
import { MainCfg } from "../runtime"
import { ChainData, CmdParam, CommandHelp, CommandStatus, DiscordFormat, ParamType, } from "../runutil"

export default class Login extends Plugin {
    // declare config file: use save data
    protected config = new LoginConfig()
    // declare command.
    private naverLogin:CommandHelp
    // status
    private status:CommandHelp
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        super.ready()
        // CommandHelp: suffix, description
        this.naverLogin = new CommandHelp("네이버 로그인", this.lang.sample.hello, true, {reqAdmin:true, dmOnly:true})
        // add parameter
        this.naverLogin.addField(ParamType.to,"OTP 코드", true)
        // get parameter as complex
        this.naverLogin.complex = true
        this.status = new CommandHelp("상태 알려", "상태 확인", true, {reqAdmin:true})
        return Promise.resolve()
    }
    /**
     * on Command Received.
     */
    public async onCommand(msg:Discord.Message, command:string, state:CmdParam):Promise<void> {
        // test command if match
        const lang = this.lang.login
        const testNaver = this.naverLogin.check(this.global,command,state)
        /**
         * naver login
         * I don't have server with https or TLS.... sh**.
         * DO NOT FORGET ERASE PASSWORD
         */
        if (testNaver.match) {
            // check naver status
            const _naverID = await this.ncc.validateLogin()
            if (_naverID != null) {
                // ok.
                await msg.channel.send(sprintf(lang.naverAlreadyOn, {id: _naverID}))
            } else {
                const otpcode = testNaver.get(ParamType.to)
                if (!/^[0-9]{8}$/g.test(otpcode)) {
                    await msg.channel.send(lang.wrongOTPCodeType)
                    return Promise.resolve()
                }
                const username = await this.ncc.loginOTP(otpcode)
                if (username == null) {
                    await msg.channel.send(lang.naverWrongPW)
                } else {
                    await msg.channel.send(lang.naverOn)
                }
            }
            return Promise.resolve()
        }
        const _status = this.status.check(this.global,command,state)
        if (_status.match) {
            const send = this.defaultRich
            const nState =
                await this.ncc.availableAsync() ? lang.naverOn : lang.naverOff
            send.addField("네이버 로그인", nState)
            send.addField("봇 관리자 여부", this.toLangString(this.global.authUsers.indexOf(msg.author.id) >= 0))
            send.author = {
                name: msg.author.username,
                icon_url: DiscordFormat.getAvatarImage(msg.author),
            }
            await msg.channel.send(send)
        }
        return Promise.resolve()
    }
}
class LoginConfig extends Config {
    public admins:string[] = []
    constructor() {
        super("login")
    }
}
/**
 * Use ChainType for readability
 */
enum ChainType {
    NAVER,
}