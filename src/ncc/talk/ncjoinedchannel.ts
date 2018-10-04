import Cafe from "../structure/cafe"
import Profile from "../structure/profile"
import NcBaseChannel, { OpenChatInfo, parseFromOpen } from "./ncbasechannel"
import NcMessage from "./ncmessage"

export default interface NcJoinedChannel extends NcBaseChannel {
    /**
     * User joined room? (not sure :( )
     */
    joined:boolean;
    /**
     * How much new messages got?
     */
    newMessageCount:number;
    /**
     * Update Message Timestamp
     * 
     * Javascript timestamp
     */
    updatedAt:number;
    /**
     * First message ID saved in ~~naver server~~ Myself
     */
    userFirstMessageNo:number;
    /**
     * ??
     */
    userLatestMessageNo:number;
    /**
     * Message delete period
     */
    period:0 | 30 | 365;
    /**
     * Openned Chat?
     */
    isOpen:boolean;
    /**
     * Visible...
     */
    isVisible:boolean;
    /**
     * Latest message
     */
    latestMessage:NcMessage;
    /**
     * Now owner (detail info)
     */
    owner:Profile;
    /**
     * Owner is original?
     */
    isOwnerOrginal:boolean;
    /**
     * ???
     */
    unreadCountVisible:boolean;
}
/**
 * Parse ncc's joined room response to typed object
 * @param joined response of joined channel
 */
export function parseFromJoined(joined:JoinedChatInfo) {
    const basicParsed = parseFromOpen(joined)
    const parsed = {
        ...basicParsed,
        cafe: {
            cafeId: joined.categoryId,
            cafeName: joined.categoryUrl,
            cafeDesc: joined.categoryName,
        } as Cafe,
        joined: joined.userStatus === "JOIN",
        newMessageCount: joined.newMessageCount,
        updatedAt: joined.updatedAt,
        userFirstMessageNo: joined.userFirstMessageNo,
        userLatestMessageNo: joined.userLatestMessageNo,
        period: [0, 30, 360][(joined.messagePeriod - 1) % 3],
        isOpen: joined.open,
        isVisible: joined.visible,
        // latestMessage: 
        // owner: 
        isOwnerOrginal: joined.originalOwner,
        unreadCountVisible: joined.unreadCountVisible,
    } as NcJoinedChannel
    parsed.latestMessage = new NcMessage(joined.latestMessage, parsed.cafe, parsed.channelID)
    const owner = joined.owner
    parsed.owner = {
        ...parsed.cafe,
        profileurl: owner.memberProfileImageUrl,
        nickname: owner.nickname,
        userid: owner.memberId,
    } as Profile
    return parsed
}
// duplicated but what matter?
export interface JoinedChatInfo extends OpenChatInfo {
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
    cafeChatRoomId?:null;
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
