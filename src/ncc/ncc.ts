import { EventEmitter } from "events"
import get from "get-value"
import io from "socket.io-client"
import { EventDispatcher, IEventHandler, ISimpleEventHandler, SimpleEventDispatcher } from "strongly-typed-events"
import Log from "../log"
import { bindFn, TimerID, WebpackTimer } from "../webpacktimer"
import NCredit from "./credit/ncredit"
import NCaptcha from "./ncaptcha"
import { CAFE_DEFAULT_IMAGE, CHAT_BACKEND_URL, 
    CHAT_HOME_URL, CHAT_SOCKET_IO, CHATAPI_BLOCKLIST_CAFE, 
    CHATAPI_CAFE_BLOCK, CHATAPI_CAFES, CHATAPI_CHANNEL_CREATE,
    CHATAPI_CHANNEL_CREATE_PERM, CHATAPI_CHANNEL_JOIN, CHATAPI_CHANNEL_OPENCREATE,
    CHATAPI_CHANNELS, CHATAPI_OPENCHAT_LIST, CHATAPI_USER_BLOCK,
    intervalError, intervalNormal } from "./ncconstant"
import { asJSON, getFirst, parseURL } from "./nccutil"
import NcFetch from "./ncfetch"
import NcCredent from "./ncredent"
import Cafe from "./structure/cafe"
import Profile from "./structure/profile"
import NcAPIStatus from "./talk/ncapistatus"
import NcBaseChannel, { ChannelInfo, ChannelType, parseFromOpen } from "./talk/ncbasechannel"
import NcChannel, { ChannelEvent } from "./talk/ncchannel"
import NcJoinedChannel, { parseFromJoined } from "./talk/ncjoinedchannel"
import NcJson from "./talk/ncjson"
import NcMessage from "./talk/ncmessage"

/**
 * Chains Naver-Cafe-Chat and JSON-API in naver cafe
 * @extends NcFetch
 */
export default class Ncc extends NcFetch {
    /**
     * Joined channels
     */
    public joinedChannels:NcJoinedChannel[] = []
    /**
     * Session connected channels
     */
    public connectedChannels:NcChannel[] = []
    /**
     * Auto connect to ncc.
     */
    public autoConnect = false
    /**
     * Auto update tasker
     */
    protected syncTask:TimerID
    /**
     * Internal events
     */
    protected events:Events
    constructor() {
        super()
        this.events = new Events(this)
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
    public async createChannel(cafe:Cafe | number, members:Array<Profile | string>,
        info:ChannelInfo = {name: "채팅방", description:"채팅방이다.", thumbnails: []},
        type = ChannelType.OnetoOne, captcha:NCaptcha = null) {
        const cafeid = typeof cafe === "number" ? cafe : cafe.cafeId
        cafe = cafeid
        const memberids:string[] = []
        if (type === ChannelType.OpenGroup) {
            if (info == null) {
                return Promise.reject("Invalid parameter.")
            }
        } else {
            members.forEach((v) => memberids.push(typeof v === "string" ? v : v.userid))
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
        if (type !== ChannelType.OpenGroup) {
            param = {
                ...captchaParam,
                "channelTypeCode": type,
                "userIdList": memberids,
            }
        } else {
            const m = info as ChannelInfo
            param = {
                ...captchaParam,
                "name": m.name,
                "description": m.description,
                "profileImageUrl": m.thumbnails,
            }
        }
        const request = await this.credit.reqPost(url.get(cafeid), {}, param).catch((err) => {Log.e(err); return null})
        let depthS = "channelId"
        if (type === ChannelType.OpenGroup) {
            depthS = "channel." + depthS
        }
        const response = new NcJson(request, (obj) => ({
            channelID: get(obj, depthS)
        }))
        await this.syncChannels()
        if (!response.valid) {
            return Promise.reject(response.errorMsg)
        }
        const channel = this.getConnectedChannel(response.result.channelID)
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
        return this.createChannel(cafe, [], {
            name: name == null ? "null" : name,
            description,
            thumbnails: [image],
        } as ChannelInfo, ChannelType.OpenGroup, captcha)
    }
    /**
     * Join channel
     * @param channelID channel id 
     */
    public async joinChannel(channelID:NcBaseChannel | number) {
        if (typeof channelID !== "number") {
            channelID = channelID.channelID  // ?
        }
        const request = await this.credit.reqPost(CHATAPI_CHANNEL_JOIN.get(channelID))
        await this.syncChannels()
        return NcAPIStatus.handleSuccess(request)
    }
    /**
     * Leave channel
     * @param channel channel id
     */
    public async leaveChannel(channel:NcBaseChannel | number) {
        if (typeof channel !== "number") {
            channel = channel.channelID
        }
        const ch = await this.getConnectedChannel(channel)
        let res:NcAPIStatus
        if (ch != null) {
            res = await ch.leave()
        } else {
            res = await NcChannel.from(this.credit, channel).then((v) => v.leave())
        }
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
        return NcAPIStatus.handleSuccess(request)
    }
    /**
     * Unblock member
     * @param user member
     */
    public async unblockMember(user:Profile | string) {
        const userid = typeof user === "string" ? user : user.userid
        const request = await this.credit.req("DELETE", CHATAPI_USER_BLOCK, {unblockedUserId: userid})
        await this.syncChannels()
        return NcAPIStatus.handleSuccess(request)
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
     * Toggle CafeChat usable
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
            error = NcAPIStatus.handleSuccess(block_req)
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
    /**
     * Get joinedChannel from ID
     * 
     * Not connected chat!
     * @param channelID Channel ID
     */
    public async getJoinedChannel(channelID:number) {
        let tries = 0
        do {
            const out = getFirst(this.joinedChannels, (v) => v.channelID === channelID)
            if (out == null) {
                if (tries < 1) {
                    await this.syncChannels()
                    tries += 1
                } else {
                    return null
                }
            } else {
                return out
            }
        } while (true)
    }
    /**
     * Get Connected Channel from id
     * 
     * Return null if not found / cannot join
     * @param channel Channel
     */
    public async getConnectedChannel(channel:number | NcJoinedChannel) {
        const channelID = typeof channel === "number" ? channel : channel.channelID
        const exist = getFirst(this.connectedChannels, (v) => v.channelID === channelID)
        if (exist != null) {
            return exist
        }
        const iCh = await this.getJoinedChannel(channelID)
        if (iCh != null) {
            try {
                return this.addConnectedChannel(iCh.channelID)
            } catch {
                return null
            }
        }
        return null
    }
    /**
     * Fetch channels and start auto sync
     * @param autoUpdate 
     */
    public async connect(autoUpdate = true) {
        if (!await this.availableAsync()) {
            return Promise.reject("Not logined")
        }
        try {
            this.joinedChannels = [...await this.fetchChannels()]
        } catch {
            return Promise.reject("No response")
        }
        const ln0 = this.joinedChannels.length
        for (let i = 0; i < ln0; i += 1) {
            if (this.shouldConnected(this.joinedChannels[i])) {
                // connect recent channels (first)
                await this.addConnectedChannel(this.joinedChannels[i].channelID)
            }
        }
        await this.syncChannels()
        if (autoUpdate) {
            this.syncTask = setTimeout(bindFn(this.syncChannels, this), intervalNormal)
        }
        this.leaveUnusedChannels()
        return Promise.resolve()
    }
    /**
     * Clear connected and joined channels (Cache)
     * 
     * This doesn't effect on naver ID
     */
    public clearChannels() {
        if (this.syncTask != null) {
            WebpackTimer.clearTimeout(this.syncTask)
        }
        this.connectedChannels.forEach((v) => v.disconnect())
        this.connectedChannels = []
        this.joinedChannels = []
    }
    /**
     * Destory Ncc
     * 
     * Unusable this object if call.
     */
    public destory() {
        this.clearChannels()
        for (const e of Object.values(this.events)) {
            if (typeof e["clear"] === "function") {
                e.clear()
            }
        }
        this.credit = new NCredit()
    }
    /**
     * Sync Channels and fetch auto
     * @param autoConnect should auto connect to chat
     */
    public async syncChannels() {
        let errored = false
        const original = [...this.joinedChannels]
        try {
            const now = await this.fetchChannels()
            // output
            const added:NcJoinedChannel[] = []
            const modified:NcJoinedChannel[] = []
            const removed:NcJoinedChannel[] = []
            // previous ids
            const previous = original.map((v) => v.channelID)
            // id pair
            for (const channel of now) {
                const i = previous.indexOf(channel.channelID)
                if (i < 0) {
                    // new channel
                    added.push(channel)
                    continue
                }
                const org = getFirst(original, (v) => v.channelID === channel.channelID)
                if (org != null) {
                    if (org.latestMessage.id !== channel.latestMessage.id ||
                        JSON.stringify(org.channelInfo) !== JSON.stringify(channel.channelInfo)) {
                        modified.push(channel)
                    }
                }
                previous.splice(i, 1)
            }
            for (const channel of original) {
                const i = previous.indexOf(channel.channelID)
                if (i >= 0) {
                    removed.push(channel)
                }
            }
            this.joinedChannels = now
            if (added.length + modified.length + removed.length >= 1 && this.autoConnect) {
                const eventChUpdate = {
                    added,
                    modified,
                    removed,
                } as ChannelListEvent
                // ensure joined new chat~~
                for (let i = 0; i < this.connectedChannels.length; i += 1) {
                    const chConnected = this.connectedChannels[i]
                    if (!this.shouldConnected(chConnected.detail)) {
                        chConnected.disconnect()
                        this.connectedChannels.splice(i, 1)
                        i -= 1
                    }
                }
                await this.syncConnectedChannels(eventChUpdate)
                this.events.onChatUpdated.dispatchAsync(eventChUpdate)
            }
        } catch (err) {
            Log.e(err)
            errored = true
        }
        if (this.syncTask != null) {
            WebpackTimer.clearTimeout(this.syncTask)
            // error : 30 seconds
            this.syncTask = WebpackTimer.setTimeout(
                bindFn(this.syncChannels, this), errored ? intervalError : intervalNormal)
        }
    }
    /**
     * Leave Dummy channels.
     */
    public async leaveUnusedChannels() {
        const unuses = this.joinedChannels.filter((v) => v.latestMessage.id == null && !this.shouldConnected(v))
        for (const unused of unuses) {
            try {
                await this.leaveChannel(unused)
            } catch (err) {
                Log.e(err)
            }
        }
        await this.syncChannels()
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
            }) as CafeWithPerm).filter((v) => chatType === ChannelType.OnetoOne ? v.onetoOne : v.group)
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
        await test.connect()
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
    protected async onLogin(username:string):Promise<void> {
        await super.onLogin(username)
        if (this.autoConnect) {
            await this.connect(true).catch(Log.e)
        }
        return Promise.resolve()
    }
    protected async onLogout():Promise<void> {
        this.clearChannels()
        return super.onLogout()
    }
    /**
     * Register event
     * @param dispatcher this.events 
     * @param handler function
     */
    protected onPrivate<V>(dispatcher:SimpleEventDispatcher<V>, handler:ISimpleEventHandler<V>) {
        dispatcher.asEvent().subscribe(handler)
    }
    /**
     * Register channel events
     * @param channel Channel
     */
    protected registerChannelEvents(channel:NcChannel) {
        Log.v("Register", "Register Channel Event - " + channel.info.name)
        this.setMaxListeners(10)
        channel.hideACK = true
        channel.on(channel.events.onMessage, (ch, msg) => {
            if (!ch.hideACK) {
                ch.sendAck(msg.id)
            }
            this.events.onMessage.dispatchAsync(ch, msg)
        })
        channel.on(channel.events.onKicked, (ch, msg) => {
            this.removeConnectedChannel(ch)
        })
    }
    /**
     * Check channel should be keep connected
     * @param channel 
     */
    protected shouldConnected(channel:NcJoinedChannel) {
        const lastDate = channel.latestMessage.id == null ? channel.createdAt : channel.latestMessage.timestamp
        return Date.now() - lastDate <= 432000000 // 5 days
    }
    /**
     * Sync connected channels from Event
     * @param list Event
     */
    protected async syncConnectedChannels(list:ChannelListEvent) {
        let loop = async <T extends NcJoinedChannel>(arr:T[], type:"remove" | "add" | "update") => {
            const ln1 = arr.length
            const ln2 = this.connectedChannels.length
            for (let i = 0; i < ln1; i += 1) {
                const param = arr[i]
                let find = -1
                // find connectedChannel exists
                for (let k = 0; k < ln2; k += 1) {
                    if (this.connectedChannels[k].channelID === param.channelID) {
                        find = k
                        break
                    }
                }
                if (find < 0) {
                    // Not find, so connect
                    let ch:NcChannel
                    if (type === "add") {
                        ch = await NcChannel.from(this.credit, param)
                    } else if (type === "update") {
                        const joinedCh =
                            getFirst(this.joinedChannels, (v) => v.channelID === param.channelID)
                        if (joinedCh != null && this.shouldConnected(joinedCh)) {
                            // join auto
                            ch = await NcChannel.from(this.credit, joinedCh)
                        }
                    }
                    if (ch != null) {
                        await this.addConnectedChannel(ch)
                    }
                } else {
                    // Find. So, disconnect
                    const ch = this.connectedChannels[find]
                    if (type === "remove") {
                        try {
                            this.removeConnectedChannel(ch)
                        } catch (err) {
                            Log.e(err)
                        }
                    }
                }
            }
        }
        loop = loop.bind(this)
        if (list.added.length >= 1) {
            await loop(list.added, "add")
        }
        if (list.modified.length >= 1) {
            await loop(list.modified, "update")
        }
        if (list.removed.length >= 1) {
            await loop(list.removed, "remove")
        }
        return Promise.resolve()
    }
    /**
     * Add Connect channel to array
     * 
     * also registers event
     * @param _ch Channel or id
     */
    protected async addConnectedChannel(_ch:number | NcChannel) {
        let id
        let channel:NcChannel
        if (typeof _ch !== "number") {
            id = _ch.channelID
            channel = _ch
        } else {
            id = _ch
        }
        const exist = getFirst(this.connectedChannels, (v) => v.channelID === id)
        if (exist != null) {
            return Promise.resolve(exist)
        }
        if (channel == null) {
            channel = await NcChannel.from(this.credit, id)
        }
        if (channel != null) {
            try {
                await channel.connect()
            } catch (err) {
                Log.e(err)
                return null
            }
            // register event
            this.registerChannelEvents(channel)
            this.connectedChannels.push(channel)
        }
        return Promise.resolve(channel)
    }
    /**
     * Remove connected channel in array
     * @param ch Channel
     */
    protected async removeConnectedChannel(ch:NcChannel) {
        let find = -1
        const ln = this.connectedChannels.length
        // find connectedChannel exists
        for (let k = 0; k < ln; k += 1) {
            if (this.connectedChannels[k].channelID === ch.channelID) {
                find = k
                break
            }
        }
        if (find >= 0) {
            ch.disconnect()
            this.connectedChannels.splice(find, 1)
        }
        return Promise.resolve()
    }
}
/**
 * Public events
 */
export enum NccEvents {
    updateList = "updateChannelList",
    message = "message",
}
/**
 * Private events
 */
class Events {
    public onMessage = this.getE<NcChannel, NcMessage>(NccEvents.message)
    public onChatUpdated = this.getSE<ChannelListEvent>(NccEvents.updateList)
    private superO:EventEmitter
    public constructor(p:EventEmitter) {
        this.superO = p
    }
    private getSE<T>(name:NccEvents) {
        const e = new SimpleEventDispatcher<T>()
        e.asEvent().subscribe((obj:any) => this.superO.emit(name, obj))
        return e
    }
    private getE<T, V>(name:NccEvents) {
        const e = new EventDispatcher<T, V>()
        e.asEvent().subscribe((obj1:T, obj2:V) => this.superO.emit(name, obj1, obj2))
        return e
    }
}
export interface ChannelListEvent {
    added:NcJoinedChannel[];
    removed:NcJoinedChannel[];
    modified:NcJoinedChannel[];
}
export interface CafeWithPerm extends Cafe {
    onetoOne:boolean;
    group:boolean;
    staff:boolean;
    blocked:boolean;
}
export interface CafePermInfo {
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