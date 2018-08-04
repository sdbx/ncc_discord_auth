import * as get from "get-value"
import Session, { Message } from "node-ncc-es6"
import * as io from "socket.io-client"
import Cache from "../cache"
import Log from "../log"
import NCredit from "./credit/ncredit"
import NCaptcha from "./ncaptcha"
import { CAFE_DEFAULT_IMAGE, CHAT_API_URL, CHAT_APIS, CHAT_BACKEND_URL, 
    CHAT_HOME_URL, CHAT_SOCKET_IO, CHATAPI_BLOCKLIST_CAFE, 
    CHATAPI_CAFE_BLOCK, CHATAPI_CAFES, CHATAPI_CHANNEL_CREATE,
    CHATAPI_CHANNEL_CREATE_PERM, CHATAPI_CHANNEL_OPENCREATE, CHATAPI_CHANNELS,
    CHATAPI_OPENCHAT_LIST, CHATAPI_USER_BLOCK, COOKIE_SITES, intervalError, intervalNormal } from "./ncconstant"
import { asJSON, getFirst, parseURL } from "./nccutil"
import NcFetch from "./ncfetch"
import NcCredent from "./ncredent"
import Cafe from "./structure/cafe"
import Profile from "./structure/profile"
import NcAPIStatus from "./talk/ncapistatus"
import NcBaseChannel, { ChannelInfo, ChannelType, parseFromOpen } from "./talk/ncbasechannel"
import NcChannel, { ChannelEvent, handleSuccess } from "./talk/ncchannel"
import NcJoinedChannel, { parseFromJoined } from "./talk/ncjoinedchannel"
import NcJson from "./talk/ncjson"
import NcMessage from "./talk/ncmessage"

export default class Ncc extends NcFetch {
    /**
     * Joined channels
     */
    public joinedChannels:NcJoinedChannel[] = []
    protected syncTask:NodeJS.Timer
    protected session:Session
    constructor() {
        super()
    }
    /**
     * Fetch current channels
     * 
     * This does NOT modify current memory
     */
    public async fetchChannels() {
        const content = asJSON(await this.credit.reqGet(CHATAPI_CHANNELS) as string)
        const response = new NcJson(content, (obj) => ({
            channelList: (get(obj, "channelList") as any[])
                    .map((channel) => parseFromJoined(channel)),
        }))
        if (!response.valid) {
            return Promise.reject(NcAPIStatus.from(response))
        }
        return response.result.channelList
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
        member:Array<Profile | string> | Profile | string | ChannelInfo,
        type = ChannelType.OnetoOne, captcha:NCaptcha = null) {
        const cafeid = typeof cafe === "number" ? cafe : cafe.cafeId
        cafe = cafeid
        const memberids:string[] = []
        if (typeof member === "object" && this.isChannelDesc(member) !== (type === ChannelType.OpenGroup)) {
            return Promise.reject("Invalid parameter.")
        }
        if (Array.isArray(member)) {
            member.forEach((v) => memberids.push(typeof v === "string" ? v : v.userid))
        } else if (typeof member === "string" || !this.isChannelDesc(member)) {
            memberids.push(typeof member === "string" ? member : member.userid)
        }
        if (memberids.length >= 2 && type === ChannelType.OnetoOne) {
            type = ChannelType.Group
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
        if (type !== ChannelType.OnetoOne && captcha == null) {
            return Promise.reject("Require Captcha")
        }
        const url = type === ChannelType.OpenGroup ? CHATAPI_CHANNEL_OPENCREATE : CHATAPI_CHANNEL_CREATE
        const captchaParam = {
            "captchaKey": captcha == null ? null : captcha.key,
            "captchaValue": captcha == null ? null : captcha.value,
        }
        let param
        if (type === ChannelType.OpenGroup) {
            const m = member as ChannelInfo
            param = {
                ...captchaParam,
                "name" : m.name,
                "description": m.description,
                "profileImageUrl": m.thumbnails,
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
        if (type === ChannelType.OpenGroup) {
            depthS = "channel." + depthS
        }
        const response = new NcJson(request, (obj) => ({
            channelID: get(obj, depthS)
        }))
        await this.syncChannels()
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
            name,
            description,
            thumbnails: [image],
        } as ChannelInfo, ChannelType.OpenGroup, captcha)
    }
    /**
     * Leave channel
     * @param channel channel id
     */
    public async leaveChannel(channel:NcBaseChannel | number) {
        if (typeof channel !== "number") {
            channel = channel.channelID
        }
        const res = await NcChannel.from(this.credit, channel).then((v) => v.leave())
        await this.syncChannels()
        return res
    }
    /**
     * Block member
     * @param user member
     */
    public async blockMember(user:Profile | string) {
        const userid = typeof user === "string" ? user : user.userid
        const request = await this.credit.reqPost(CHATAPI_USER_BLOCK, {}, {blockedUserId: userid})
        await this.syncChannels()
        return handleSuccess(request)
    }
    /**
     * Unblock member
     * @param user member
     */
    public async unblockMember(user:Profile | string) {
        const userid = typeof user === "string" ? user : user.userid
        const request = await this.credit.req("DELETE", CHATAPI_USER_BLOCK, {unblockedUserId: userid})
        await this.syncChannels()
        return handleSuccess(request)
    }
    /**
     * Get blocked member **ID**s
     */
    public async blockedMembers() {
        const request = await this.credit.req("GET", CHATAPI_USER_BLOCK)
        const response = new NcJson(request, (obj) => obj["blockedCafeMemberList"] as string[])
        if (response.valid) {
            return Promise.resolve(response.result)
        }
        return Promise.reject(NcAPIStatus.from(response))
    }
    /**
     * Toggle CafeChat using
     * 
     * If cafe is unusable chat, just return success code.
     * @param cafe Cafe
     * @param type Group or 1:1
     * @param block Blocking chat?
     */
    public async toggleCafeChat(cafe:Cafe | number, type:ChannelType.Group | ChannelType.OnetoOne, block:boolean) {
        const cafeid = typeof cafe === "number" ? cafe : cafe.cafeId
        let error:NcAPIStatus = null
        const blockables = await this.blockableCafes(type, cafeid).catch((status) => {error = status; return []})
        if (blockables.length >= 1) {
            const block_req = await this.credit.req(block ? "POST" : "DELETE", CHATAPI_CAFE_BLOCK.get(cafeid),
                !block ? {type} : {}, block ? {type} : {})
            error = await handleSuccess(block_req)
        }
        if (error != null && !error.success) {
            return error
        } else {
            return NcAPIStatus.success()
        }
    }
    /**
     * Get blockable (anyway useable) cafes
     * 
     * Check: result.blockCafe
     * @param type Group or 1:1
     * @param cafe Cafe (not provided, return all)
     * @returns **Array**
     */
    public async blockableCafes(type:ChannelType.Group | ChannelType.OnetoOne, cafe:Cafe | number = -1) {
        const cafeid = typeof cafe === "number" ? cafe : cafe.cafeId
        const blockables = new NcJson<CafePermInfo[]>(
            await this.credit.reqGet(CHATAPI_BLOCKLIST_CAFE, { type }),
            (obj) => obj["blockingMyCafeList"].map((v) => v as CafePermInfo)
        )
        if (blockables.valid) {
            return Promise.reject(NcAPIStatus.from(blockables))
        }
        if (cafeid >= 0) {
            return blockables.result
        } else {
            return blockables.result.filter((v) => v.cafeId === cafeid)
        }
    }
    /**
     * Get open chat(exclude already joined) list
     * @param cafe Cafe
     */
    public async getOpenChannels(cafe:Cafe | number) {
        const cafeid = typeof cafe === "number" ? cafe : cafe.cafeId
        const openChannels:NcBaseChannel[] = []
        let index = 1
        while (true) {
            const request = await this.credit.reqGet(CHATAPI_OPENCHAT_LIST.get(cafeid), {
                page: index,
                perPage: 30,
            })
            const response = new NcJson(request, (obj) => ({
                more: obj["more"],
                channels: (obj["joinableOpenChannelList"] as any[]).map((v) => parseFromOpen(v))
            }))
            if (!response.valid) {
                return NcAPIStatus.from(response)
            }
            openChannels.push(...response.result.channels)
            if (!response.result.more) {
                break
            }
            index += 1
        }
        return openChannels
    }
    public async connect(autoUpdate = false) {
        if (!await this.availableAsync()) {
            return Promise.reject("Not logined")
        }
        try {
            this.joinedChannels = [...await this.fetchChannels()]
        } catch {
            return Promise.reject("No response")
        }
        if (autoUpdate) {
            this.syncTask = setTimeout(this.syncChannels.bind(this), intervalNormal)
        }
    }
    public async syncChannels() {
        let errored = false
        const original = [...this.joinedChannels]
        try {
            this.joinedChannels = await this.fetchChannels()
            const previous = original.map((v) => v.channelID)
            const now = this.joinedChannels.map((v) => v.channelID)
            const added = this.joinedChannels.filter((v) => previous.indexOf(v.channelID) < 0)
            const removed = original.filter((v) => now.indexOf(v.channelID) < 0)
            if (added.length >= 1) {
                Log.d("Added.")
            }
            if (removed.length >= 1) {
                Log.d("Deleted.")
            }
        } catch (err) {
            Log.e(err)
            errored = true
        }
        if (this.syncTask != null) {
            clearTimeout(this.syncTask)
            // error : 30 seconds
            setTimeout(this.syncChannels.bind(this), errored ? intervalError : intervalNormal)
        }
    }
    /**
     * List joinable cafes
     * @param ChannelType one2one or group!
     */
    public async listCafes(chatType:ChannelType) {
        const request = await this.credit.reqGet(CHATAPI_CAFES.get(chatType))
        const response = new NcJson(request, (obj) => {
            const arr = get(obj, "myCafeList", {default: []}) as CafePermInfo[]
            return arr.map((_cafe) => ({
                cafeId: _cafe.cafeId,
                cafeName: _cafe.cafeUrl,
                cafeDesc: _cafe.cafeName,
                cafeImage: _cafe.cafeThumbnail.length <= 0 ? CAFE_DEFAULT_IMAGE : _cafe.cafeThumbnail,
                onetoOne: _cafe.memberLevel >= _cafe.oneToOneCreateLevel,
                group: _cafe.memberLevel >= _cafe.groupCreateLevel,
                staff: _cafe.managingCafe,
                blocked: false,
            }) as CafewChatPerm).filter((v) => chatType === ChannelType.OnetoOne ? v.onetoOne : v.group)
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
    private isChannelDesc(param:any):param is ChannelInfo {
        return "name" in param
    }
}
interface CafewChatPerm extends Cafe {
    onetoOne:boolean;
    group:boolean;
    staff:boolean;
    blocked:boolean;
}
interface CafePermInfo {
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