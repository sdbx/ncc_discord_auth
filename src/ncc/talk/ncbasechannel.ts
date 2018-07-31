import Cafe from "../../structure/cafe";
import Profile from "../../structure/profile";
import NcMessage from "./ncmessage";

export default class NcBaseChannel {
    private readonly instance:INcChannel;
    private _cafe:Cafe = null;
    constructor(obj:object) {
        this.instance = obj as INcChannel;
    }
    /**
     * Channel ID
     * 
     * 채널 고유 ID
     */
    public get channelId() {
        return this.instance.channelId;
    }
    /**
     * Unread count
     * 
     * 안 읽은 메세지
     */
    public get unreads() {
        return this.instance.newMessageCount;
    }
    /**
     * User count
     * 
     * 유저 **수**
     */
    public get userCount() {
        return this.instance.userCount;
    }
    /**
     * Cafe Info
     * 
     * 네이버 카페 정보
     */
    public get cafe() {
        if (this._cafe == null) {
            const cafe = {
                cafeId: this.instance.categoryId,
                cafeName: this.instance.categoryUrl,
                cafeDesc: this.instance.categoryName,
            } as Cafe;
            if (this.instance.thumbnailList.length >= 1) {
                cafe.cafeImage = this.instance.thumbnailList[0];
            }
            this._cafe = cafe;
        }
        return this._cafe;
    }
    /**
     * Chat info
     * 
     * 채팅방 정보
     */
    public get description() {
        return this.instance.description;
    }
    /**
     * Open chat
     * 
     * 오픈채팅방 여부
     */
    public get openChat() {
        return this.instance.open;
    }
    /**
     * Owner
     * 
     * 채팅방 방장
     */
    public get owner():Profile {
        const owner = this.instance.owner;
        const cafe = this.cafe;
        return {
            ...cafe,
            profileurl: owner.memberProfileImageUrl,
            nickname: owner.nickname,
            userid: owner.memberId,
        } as Profile;
    }
    /**
     * Last message
     * 
     * 최근 메세지
     */
    public get lastMessage():NcMessage {
        return new NcMessage(this.instance.latestMessage, this.cafe, this.channelId);
    }
}
interface INcChannel {
    name:string;
    type:number;
    channelId:number;
    userStatus:string;
    newMessageCount:number;
    thumbnailList?:string[] | null;
    updatedAt:number;
    createdAt:number;
    userCount:number;
    userPushType:string;
    userFirstMessageNo:number;
    userLatestMessageNo:number;
    categoryId:number;
    categoryName:string;
    categoryUrl:string;
    description:string;
    defaultChannel:boolean;
    messagePeriod:number;
    open:boolean;
    visible:boolean;
    latestMessage:LatestMessage;
    owner:Owner;
    originalOwner:boolean;
    unreadCountVisible:boolean;
    cafeChatRoomId?:number;
}
interface LatestMessage {
    id:number;
    body:string;
    writerId:string;
    writerName:string;
    type:number;
    createdTime:number;
    extras?:null;
}
interface Owner {
    memberId:string;
    maskingId:string;
    nickname:string;
    memberProfileImageUrl:string;
    manager:boolean;
    cafeMember:boolean;
    status:string;
}
interface NccMember extends Profile {
    kickable:boolean;
    channelManageable:boolean;
}