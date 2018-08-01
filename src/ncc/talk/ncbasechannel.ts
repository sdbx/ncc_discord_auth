import Cafe from "../../structure/cafe";
import Profile from "../../structure/profile";
import NcMessage from "./ncmessage";

export default class NcBaseChannel {
    protected baseinfo:INcChannel;
    private _cafe:Cafe = null;
    constructor(obj:object) {
        if (obj != null) {
            this.baseinfo = {...obj} as INcChannel;
        }
    }
    /**
     * Channel ID
     * 
     * 채널 고유 ID
     */
    public get channelId() {
        return this.baseinfo.channelId;
    }
    /**
     * Unread count
     * 
     * 안 읽은 메세지
     */
    public get unreads() {
        return this.baseinfo.newMessageCount;
    }
    /**
     * User count
     * 
     * 유저 **수**
     */
    public get userCount() {
        return this.baseinfo.userCount;
    }
    /**
     * Cafe Info
     * 
     * 네이버 카페 정보
     */
    public get cafe() {
        if (this._cafe == null) {
            const cafe = {
                cafeId: this.baseinfo.categoryId,
                cafeName: this.baseinfo.categoryUrl,
                cafeDesc: this.baseinfo.categoryName,
            } as Cafe;
            if (this.baseinfo.thumbnailList.length >= 1) {
                cafe.cafeImage = this.baseinfo.thumbnailList[0];
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
        return this.baseinfo.description;
    }
    /**
     * Open chat
     * 
     * 오픈채팅방 여부
     */
    public get openChat() {
        return this.baseinfo.open;
    }
    /**
     * Owner
     * 
     * 채팅방 방장
     */
    public get owner():Profile {
        const owner = this.baseinfo.owner;
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
        return new NcMessage(this.baseinfo.latestMessage, this.cafe, this.channelId);
    }
}
export interface INcChannel {
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