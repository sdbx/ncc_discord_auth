import { NcIDBase } from "../ncconstant"
import Cafe from "../structure/cafe"

export default interface NcBaseChannel extends NcIDBase {
    /**
     * Unique Channel ID
     */
    channelID:number;
    /**
     * Chat Info (name, desc, image)
     */
    channelInfo:ChannelInfo;
    /**
     * Channel Type
     */
    type:ChannelType;
    /**
     * Cafe info
     * 
     * Only cafeID is ensure!!
     */
    cafe:Cafe;
    /**
     * When to create this channel
     * 
     * Javascript Timestamp
     */
    createdAt:number;
    /**
     * Count of Members
     */
    userCount:number;
    /**
     * The id of owner (Detail for owner)
     */
    ownerid:string;
}
/**
 * Parse ncc's openChatList response to Typed object
 * @param json response of openchannel
 */
export function parseFromOpen(json:OpenChatInfo) {
    return {
        channelID: json.channelId,
        channelInfo: {
            name: json.name,
            description: json.description,
            thumbnails: json.thumbnailList == null ? [] : json.thumbnailList,
        },
        type: json.type,
        cafe: {
            cafeId: json.categoryId
        } as Cafe,
        createdAt: json.createdAt,
        userCount: json.userCount,
        ownerid: json.ownerId == null ? null : json.ownerId,
    } as NcBaseChannel
}
export interface OpenChatInfo {
    thumbnailList?:string[] | null;
    name:string;
    type:number;
    description:string;
    channelId:number;
    createdAt:number;
    userCount:number;
    categoryId:number;
    defaultChannel:boolean;
    joinStatus:string;
    latestMessageReceivedTime?:number;
    cafeChatRoomId?:number;
    originalOwnerId:string;
    ownerId?:string;
}

/**
 * Channel Info interface
 */
export interface ChannelInfo {
    name:string;
    description:string;
    thumbnails:string[];
}
/**
 * Channel Type
 */
export enum ChannelType {
    OnetoOne = 1,
    Group = 2,
    OpenGroup = 4,
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
    latestMessage?:LatestMessage;
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