import * as get from "get-value"
import Session, { Message } from "node-ncc-es6"
import * as io from "socket.io-client"
import Cache from "../cache"
import Log from "../log"
import NCredit from "./credit/ncredit"
import NCaptcha from "./ncaptcha"
import { CAFE_DEFAULT_IMAGE, CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, 
    CHAT_HOME_URL, CHAT_SOCKET_IO, CHATAPI_CAFES, 
    CHATAPI_CHANNEL_CREATE, CHATAPI_CHANNEL_CREATE_PERM, CHATAPI_CHANNEL_OPENCREATE,
    CHATAPI_CHANNELS, COOKIE_SITES } from "./ncconstant"
import { asJSON, getFirst, parseURL } from "./nccutil"
import NcFetch from "./ncfetch"
import NcCredent from "./ncredent"
import Cafe from "./structure/cafe"
import Profile from "./structure/profile"
import NcBaseChannel from "./talk/ncbasechannel"
import NcChannel, { ChannelEvent, ChatType } from "./talk/ncchannel"
import NcJson from "./talk/ncjson"
import NcMessage from "./talk/ncmessage"

export default class Ncc extends NcFetch {
    protected session:Session
    constructor() {
        super()
    }
    /**
     * Fetch current channels
     */
    public async fetchChannels() {
        const content = asJSON(await this.credit.reqGet(CHATAPI_CHANNELS) as string)
        const response = new NcJson(content, (obj) => ({
            channelList: (get(obj, "channelList") as object[])
                    .map((channel) => new NcBaseChannel(channel)),
        }))
        return response
    }
    /**
     * Create channel
     * @returns Connected channel or Promise.reject
     * @param cafe Cafe
     * @param member Invite member (Profile)
     * @param type Chat Type (Group: requires captcha)
     * @param captcha Captcha (generated, **GroupChat**)
     */
    public async createChannel(cafe:Cafe | number,
        member:Array<Profile | string> | Profile | string | OpenChatOption,
        type = ChatType.OnetoOne, captcha:NCaptcha = null) {
        const cafeid = typeof cafe === "number" ? cafe : cafe.cafeId
        cafe = cafeid
        const memberids:string[] = []
        if (typeof member === "object" && this.isChannelDesc(member) !== (type === ChatType.OpenGroup)) {
            return Promise.reject("Invalid parameter.")
        }
        if (Array.isArray(member)) {
            member.forEach((v) => memberids.push(typeof v === "string" ? v : v.userid))
        } else if (typeof member === "string" || !this.isChannelDesc(member)) {
            memberids.push(typeof member === "string" ? member : member.userid)
        }
        if (memberids.length >= 2 && type === ChatType.OnetoOne) {
            type = ChatType.Group
        }
        // check perm
        const privilege = new NcJson(
            await this.credit.reqGet(CHATAPI_CHANNEL_CREATE_PERM.get(cafeid, type)), (obj) => {
                const arr = get(obj, "createChannelPrivilegeList", {default:[]}) as object[]
                return arr.map((v) => ({
                    channelType: v["channelType"] as number,
                    creatable: v["creatable"] as boolean
                })).filter((v) => v.channelType === type)
        })
        if (!privilege.valid || privilege.result.length <= 0 || !privilege.result[0].creatable) {
            return Promise.reject("No permission.")
        }
        if (type !== ChatType.OnetoOne && captcha == null) {
            return Promise.reject("Require Captcha")
        }
        const url = type === ChatType.OpenGroup ? CHATAPI_CHANNEL_OPENCREATE : CHATAPI_CHANNEL_CREATE
        const captchaParam = {
            "captchaKey": captcha == null ? null : captcha.key,
            "captchaValue": captcha == null ? null : captcha.value,
        }
        let param
        if (type === ChatType.OpenGroup) {
            const m = member as OpenChatOption
            param = {
                ...captchaParam,
                "name" : m.channelName,
                "description": m.desc,
                "profileImageUrl": m.image,
            }
        } else {
            param = {
                ...captchaParam,
                "channelTypeCode": type,
                "userIdList": memberids,
            }
        }
        const request = await this.credit.reqPost(url.get(cafeid), {}, param)
        let depthS = "channelId"
        if (type === ChatType.OpenGroup) {
            depthS = "channel." + depthS
        }
        const response = new NcJson(request, (obj) => ({
            channelID: get(obj, depthS)
        }))
        if (!response.valid) {
            return Promise.reject(response.error.msg)
        }
        const channel = await NcChannel.from(this.credit, response.result.channelID)
        return channel
    }
    /**
     * Create OpenChannel
     * @param cafe Cafe id
     * @param captcha Captcha (open chat uses captcha)
     * @param name Chat Title
     * @param description Chat description
     * @param image Image URL (external is ok.)
     */
    public async createOpenChannel(cafe:Cafe | number,captcha:NCaptcha,
        name:string, description:string = "", image?:string) {
        return this.createChannel(cafe, {
            channelName: name,
            desc: description,
            image,
        } as OpenChatOption, ChatType.OpenGroup, captcha)
    }
    public async leaveChannel(channel:NcBaseChannel | number) {
        if (typeof channel !== "number") {
            channel = channel.channelID
        }
        return NcChannel.quit(this.credit, channel)
    }
    /**
     * List joinable cafes
     * @param chatType one2one or group!
     */
    public async listCafes(chatType:ChatType) {
        const request = await this.credit.reqGet(CHATAPI_CAFES.get(chatType))
        const response = new NcJson(request, (obj) => {
            const arr = get(obj, "myCafeList", {default:[]}) as ICafewP[]
            return arr.map((_cafe) => ({
                cafeId: _cafe.cafeId,
                cafeName: _cafe.cafeUrl,
                cafeDesc: _cafe.cafeName,
                cafeImage: _cafe.cafeThumbnail.length <= 0 ? CAFE_DEFAULT_IMAGE : _cafe.cafeThumbnail,
                onetoOne: _cafe.memberLevel >= _cafe.oneToOneCreateLevel,
                group: _cafe.memberLevel >= _cafe.groupCreateLevel,
            }) as CafewChatPerm).filter((v) => chatType === ChatType.OnetoOne ? v.onetoOne : v.group)
        })
        return response
    }
    /**
     * Test channel..
     * @param channel what? 
     */
    public async testChannel(channel:number | NcBaseChannel) {
        if (typeof channel !== "number") {
            channel = channel.channelID
        }
        const test = await NcChannel.from(this.credit, channel)
        await test.connect(this.credit)
        // message
        test.on(test.events.onMessage, (ch, msg) => {
            Log.d(NcMessage.typeAsString(msg.type), JSON.stringify(msg.content, null, 4))
            if (msg.embed != null) {
                Log.d("embed", JSON.stringify(msg.embed, null, 4))
            }
        })
        // member join
        test.on(test.events.onMemberJoin, async (ch, join) => {
            Log.d("Joined",join.newMember.nickname)
        })
        // member leave
        test.on(test.events.onMemberQuit, (ch, quit) => {
            Log.d("Quited", quit.first.nickname)
        })
        // room name changed
        test.on(test.events.onRoomnameChanged, (ch, name) => {
            Log.d("Changed room", "Before: " + name.before + 
                " After: " + name.after + " Sender: " + name.modifier.nickname)
        })
        // master changed
        test.on(test.events.onMasterChanged, (ch, master) => {
            Log.d("Changed master:", "ID: " + master.newMaster.userid)
        })
        // kicked user
        test.on(test.events.onMemberKick, (ch, user) => {
            Log.d("Kicked:", "ID: " + user.first.nickname)
        })
    }
    public async getRoom(roomID:string) {
        if (await this.availableAsync()) {
            const rooms = (await this.chat.getRoomList()).filter((_v) => _v.id === roomID)
            for (const _room of rooms) {
                return _room
            }
        }
        return null
    }
    public async deleteRoom(roomID:string) {
        const room = await this.getRoom(roomID)
        if (room != null) {
            await this.chat.deleteRoom(room)
        }
        return Promise.resolve()
    }
    protected async onLogin(username:string):Promise<void> {
        super.onLogin(username)
        /*
        this.session = new Session(this.credit);
        await this.session.connect();
        await this.chat.getRoomList();
        this.chat.on("message",this.onNccMessage.bind(this));
        */
        return Promise.resolve()
    }
    protected async onNccMessage(message:Message) {
        this.emit("message",message)
    }
    /**
     * get session
     */
    public get chat():Session {
        return this.session
    }
    private isChannelDesc(param:any):param is OpenChatOption {
        return "channelName" in param
    }
}
export interface OpenChatOption {
    channelName:string;
    desc?:string;
    image?:string;
}
interface CafewChatPerm extends Cafe {
    onetoOne:boolean;
    group:boolean;
}
interface ICafewP {
    cafeId:number;
    cafeName:string;
    cafeUrl:string;
    cafeThumbnail:string;
    memberNickname:string;
    memberLevel:number;
    managingCafe:boolean;
    groupCreateLevel:number;
    oneToOneCreateLevel:number;
    blockCafe:boolean;
    dormantCafe:boolean;
}
  