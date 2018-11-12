/**
 * Parse video info from videoInfo
 * @param json JSON response.
 */
export function parseVideo(json:object):NaverVideo {
    const res = json as NVResponse
    const videos = res.videos.list.map((v) => ({
        mp4Id: v.id,
        duration: Number.parseFloat(v.duration),
        fileSize: Number.parseInt(v.size),
        encodingName: v.encodingOption.name,
        width: Number.parseInt(v.encodingOption.width),
        height: Number.parseInt(v.encodingOption.height),
        isEncodingComplete: v.encodingOption.isEncodingComplete === "true",
        bitrateVideo: Number.parseFloat(v.bitrate.video),
        bitrateAudio: Number.parseFloat(v.bitrate.audio),
        source: v.source,
    } as VideoInfo))
    let thumbnails:ThumbnailInfo[]
    if (res.thumbnails != null && res.thumbnails.list != null) {
        thumbnails = res.thumbnails.list.map((v) => ({
            time: Number.parseFloat(v.time),
            imageUrl: v.source,
        } as ThumbnailInfo))
    } else {
        thumbnails = []
    }
    const meta = res.meta
    let countURL:string = ""
    for (const apiPair of meta.apiList) {
        if (apiPair.name === "count") {
            countURL = apiPair.source
            break
        }
    }
    return {
        masterVideoId: meta.masterVideoId,
        watchCount: Number.parseInt(meta.count),
        articleURL: meta.url,
        title: meta.subject,
        previewImg: meta.cover.source,
        author: {
            nickname: meta.user.name,
            userid: meta.user.id,
        },
        countRestUrl: countURL,
        videos,
        thumbnails,
    }
}

export default interface NaverVideo {
    /**
     * Video's unique ID (cannot watch if only have this id)
     */
    masterVideoId:string;
    /**
     * Video's watched count
     */
    watchCount:number;
    /**
     * Original Article ID
     */
    articleURL:string;
    /**
     * Video's title
     */
    title:string;
    /**
     * Video's preview image
     */
    previewImg:string;
    /**
     * Video's author in cafe?
     */
    author:{nickname:string, userid:string};
    /**
     * Use This If you want to up count
     */
    countRestUrl:string;
    /**
     * Video infos (different with quality)
     */
    videos:VideoInfo[];
    /**
     * Preview images (I think there's so much previews)
     */
    thumbnails:ThumbnailInfo[];
    /**
     * Share URL with outKey (maybe ignore timestamp?)
     */
    share?:string;
}
export interface ThumbnailInfo {
    /**
     * Second
     */
    time:number;
    /**
     * Image URL
     */
    imageUrl:string;
}
export interface VideoInfo {
    /**
     * MP4's ID
     */
    mp4Id:string;
    /**
     * Duration of video
     * 
     * @type Float
     */
    duration:number;
    /**
     * Filesize of video
     * Byte.
     */
    fileSize:number;
    /**
     * 1080P / 720P / 480P / etc..
     */
    encodingName:string;
    /**
     * Video's Width
     */
    width:number;
    /**
     * Video's Height
     */
    height:number;
    /**
     * Playable?
     */
    isEncodingComplete:boolean;
    /**
     * Bitrate of Video (kbps)
     */
    bitrateVideo:number;
    /**
     * Bitrate of Audio (kbps)
     */
    bitrateAudio:number;
    /**
     * The mp4 url with timestamp
     * 
     * **WARNING**: This url only works about ~30 minutes fron now.
     */
    source:string;
}
/**
 * Make timestamp to 125,000,000
 * 
 * Maybe testing.
 * @param key 
 */
export function forceTimestamp(key:string) {
    // V12 + 5 (timeValue 1~7) + 00000000 (stable key for 5)
    return key.substring(0, 3) + "5" + key.substr(4)
}
interface NVResponse {
    meta:Meta;
    videos:Videos;
    streams?:null[] | null;
    captions:Captions;
    thumbnails:Thumbnails;
    trackings:Trackings;
}
interface Meta {
    masterVideoId:string;
    contentId:string;
    serviceId:string;
    count:string;
    url:string;
    homeUrl:string;
    subject:string;
    cover:CoverOrRelationVideo;
    share:Share;
    user:User;
    relationVideo:CoverOrRelationVideo;
    apiList?:ApiListEntity[] | null;
    display:Display;
}
interface CoverOrRelationVideo {
    type:string;
    source:string;
}
interface Share {
    usable:string;
    count:string;
    onlyInnerServices:string;
}
interface User {
    id:string;
    name:string;
    url:string;
}
interface ApiListEntity {
    name:string;
    source:string;
}
interface Display {
    screenClickPlay:IVisible;
    logo:IVisible;
    playbackRate:IVisible;
    scrap:IVisible;
    thumbnails:IVisible;
    vodinfo:IVisible;
    script:IVisible;
    setting:IVisible;
    fullscreen:IVisible;
    seekable:IVisible;
    subtitle:IVisible;
    quality:IVisible;
    expand:Expand;
    playButton:IVisible;
    captionUpload:IVisible;
    writer:IVisible;
    createTime:IVisible;
    title:IVisible;
    linkCount:IVisible;
    playCount:IVisible;
}
interface IVisible {
    visible:string;
}
interface Expand {
    visible:string;
    value:string;
}
interface Videos {
    type:string;
    canAutoPlay:boolean;
    isMultiTrack:boolean;
    dimension:string;
    list?:ListEntity[] | null;
}
interface ListEntity {
    id:string;
    useP2P:string;
    duration:string;
    size:string;
    isDefault:boolean;
    encodingOption:EncodingOption;
    bitrate:Bitrate;
    p2pMetaUrl:string;
    source:string;
}
interface EncodingOption {
    id:string;
    name:string;
    profile:string;
    width:string;
    height:string;
    isEncodingComplete:string;
}
interface Bitrate {
    video:string;
    audio:string;
}
interface Captions {
    list?:null[] | null;
}
interface Thumbnails {
    list?:ListEntity1[] | null;
}
interface ListEntity1 {
    time:string;
    source:string;
    tag:string;
}
interface Trackings {
    default?:null[] | null;
    android?:null[] | null;
}
  