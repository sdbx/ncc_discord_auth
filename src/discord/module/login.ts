import Discord from "discord.js"
import Hangul from "hangul-js"
import request from "request-promise-native"
import { sprintf } from "sprintf-js"
import Config from "../../config"
import Log from "../../log"
import { LoginError } from "../../ncc/credit/ncredit"
import { bindFn, TimerID, WebpackTimer } from "../../webpacktimer"
import Plugin from "../plugin"
import { ChainData, CmdParam, ParamType } from "../rundefine"
import { CommandHelp, DiscordFormat } from "../runutil"

const refreshDelay = 43200 * 1000

export default class Login extends Plugin {
    // declare config file: use save data
    protected config = new LoginConfig()
    // declare command.
    private naverLogin:CommandHelp
    private refreshLogin:CommandHelp
    // status
    private status:CommandHelp
    // refreshing
    private refreshing = false
    // last logined
    private lastLogined:number = -1
    private refreshTimer:TimerID
    /**
     * Initialize command
     */
    public async ready() {
        // super: load config
        await super.ready()
        // CommandHelp: suffix, description
        this.naverLogin = new CommandHelp("네이버 로그인", this.lang.login.descLogin, true,
            {reqAdmin:true, chatType: "dm"})
        // add parameter
        this.naverLogin.addField(ParamType.to,"OTP 코드", false)
        // get parameter as complex
        this.naverLogin.complex = true
        this.status = new CommandHelp("상태 알려", "상태를 확인합니다.", true)
        // Login Refresh
        this.refreshLogin = new CommandHelp("로그인 갱신", this.lang.login.descRefresh, true, {reqAdmin: true})
        if (await this.ncc.availableAsync()) {
            this.lastLogined = Date.now()
        }
        this.ncc.on("login", () => {
            this.lastLogined = Date.now()
        })
        this.refreshTimer = WebpackTimer.setInterval(bindFn(this.refreshAccount, this), refreshDelay)
        return Promise.resolve()
    }
    public async onDestroy() {
        await super.onDestroy()
        WebpackTimer.clearInterval(this.refreshTimer)
        return Promise.resolve()
    }
    /**
     * Refresh account
     * @returns did
     */
    public async refreshAccount(_channel:Discord.Channel = null) {
        if (this.refreshing) {
            return false
        }
        this.refreshing = true
        let ch:Discord.Channel
        if (_channel != null) {
            ch = _channel
        } else {
            ch = this.client.channels.find((v) => v.id === this.config.refreshAlertCh)
        }
        let msg:Discord.Message
        if (ch != null && ch instanceof Discord.TextChannel) {
            try {
                msg = await ch.send(this.lang.login.refreshing) as Discord.Message
            } catch {
                // :)
            }
        }
        const result:string = await this.ncc.refresh().then(() => null).catch((str) => str)
        if (msg != null) {
            try {
                await msg.edit(result == null ? this.lang.login.refreshSuccess :
                    `${this.lang.login.refreshFail} (${result})`)
            } catch {
                // :)
            }
        }
        this.refreshing = false
        return true
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
            const test = testNaver.get(ParamType.to)
            if (testNaver.has(ParamType.to)) {
                /**
                 * New OTP Login
                 */
                // check naver status
                const _naverID = await this.ncc.validateLogin(true)
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
            } else {
                /**
                 * Old id, pw Login
                 */
                // set chain item
                const req = {
                    id: null as string,
                    pw: null as string,
                    captcha: null as string,
                }
                // tell what to type
                const type = req.id == null ? "아이디" : "비밀번호"
                await msg.channel.send(sprintf(lang.naverRequest, {
                    type,
                    suffix: Hangul.endsWithConsonant(type) ? "을" : "를"
                }))
                // chain start
                this.startChain(msg.channel.id, msg.author.id, ChainType.NAVER, req)
            }
            return Promise.resolve()
        }
        const _status = this.status.check(this.global,command,state)
        if (_status.match) {
            const send = this.defaultRich
            const nState =
                await this.ncc.availableAsync() ? lang.naverOn : lang.naverOff
            send.addField("네이버 로그인", nState, true)
            send.addField("봇 관리자 여부", this.toLangString(this.global.authUsers.indexOf(msg.author.id) >= 0), true)
            if (this.lastLogined >= 0) {
                const sayDate = (num:number, suffix:string, sp:number) => {
                    return num >= 1 ? (sp >= 1 ? num.toString().padStart(2, "0") : num) + suffix + " " : ""
                }
                const delta = Math.floor((Date.now() - this.lastLogined) / 1000)
                const second = (delta % 60)
                const minute = (Math.floor(delta / 60) % 60)
                const hour = (Math.floor(delta / 3600) % 24)
                const day = Math.floor(delta / 86400)
                const date = `${sayDate(day, "일", 0)}${sayDate(hour, "시간", day)}${
                    sayDate(minute, "분", hour)}${sayDate(second, "초", minute)}전`
                send.addField("갱신한 시간", date)
            }
            send.author = {
                name: msg.author.username,
                icon_url: DiscordFormat.getAvatarImage(msg.author),
            }
            await msg.channel.send(send)
            return Promise.resolve()
        }
        const _refresh = this.refreshLogin.check(this.global, command, state)
        if (_refresh.match) {
            if (Date.now() - this.lastLogined <= 6000) {
                await msg.channel.send("로그인 후 1분이 지나야 합니다.")
                return Promise.resolve()
            }
            this.refreshAccount(msg.channel).then((success) => {
                if (!success) {
                    msg.channel.send("이미 갱신 중입니다.")
                } else {
                    msg.channel.send("완료되었습니다.")
                }
            })
            return Promise.resolve()
        }
        return Promise.resolve()
    }
    /**
     * Receiving userid, password
     */
    protected async onChainMessage(message:Discord.Message, type:number, data:ChainData):Promise<ChainData> {
        const typing = data.data as {id:string,pw:string,captcha:string}
        const content = message.content
        const lang = this.lang.login
        data.time = Date.now()
        // fill
        if (typing.id == null) {
            await message.channel.send(sprintf(lang.naverRequest, {
                type: "비밀번호",
                suffix: "를",
            }))
            typing.id = content
        } else if (typing.pw == null || typing.captcha != null) {
            // end chain
            let captchaValue:{key:string,value:string} = null
            if (typing.pw == null) {
                typing.pw = content
            } else {
                captchaValue = {
                    key: typing.captcha,
                    value: content,
                }
            }
            const result:LoginError = await this.ncc.login(typing.id,typing.pw,captchaValue)
                .then((username) => null).catch((err) => err)
            if (result == null) {
                await message.reply(lang.naverOn + "\n" + lang.passwordDelete)
                // await message.channel.send(result.pwd ? lang.naverWrongPW : lang.naverOn);
                return this.endChain(message, type, data)
            } else {
                if (result.captcha) {
                    const url = result.captchaURL
                    typing.captcha = result.captchaKey
                    const image:Buffer = await request.get(url, {encoding:null})

                    const rich = new Discord.RichEmbed()
                    rich.setTitle(lang.naverReqCaptcha)
                    rich.attachFile(new Discord.Attachment(image,"captcha.png"))
                    rich.setImage("attachment://captcha.png")
                    await message.channel.send(rich)
                } else {
                    // pwd wrong
                    await message.channel.send(lang.naverWrongPW)
                    return this.endChain(message, type, data)
                }
            }    
        } else {
            // this should never happen.
            Log.w("WTF", "login.ts - onChainMessage")
            return this.endChain(message, type, data)
        }
        return Promise.resolve(data)
    }
    protected async onChainEnd(message:Discord.Message, type:number, data:ChainData):Promise<void> {
        // on receive all data
        return Promise.resolve()
    }
}
class LoginConfig extends Config {
    public admins:string[] = []
    public refreshAlertCh:string = "5353"
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