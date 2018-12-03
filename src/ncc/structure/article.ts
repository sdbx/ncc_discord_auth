import ytdl from "ytdl-core"
import Cafe from "./cafe"
import Comment from "./comment"
import NaverVideo from "./navervideo"

export default interface Article extends Cafe {
    /**
     * Article ID
     * 
     * @type Int
     */
    articleId:number;
    /**
     * Article Title
     */
    articleTitle:string; // article title
    /**
     * Article Flags
     */
    flags:{
        file:boolean,
        image:boolean,
        video:boolean,
        question:boolean,
        vote:boolean,
    }; // article flags
    /**
     * User's nickname
     */
    userName:string; // user name
    /**
     * User's naverID
     */
    userId:string; // real user identifier
    /**
     * Article's URL
     */
    url:string; // article url
    /**
     * File Attachments
     * 
     * length is zero if not exists.
     */
    attaches?:string[]; // attach file urls
    /**
     * Article's Comments
     */
    comments?:Comment[]; // comments
    /**
     * Main Image's URL
     */
    imageURL?:string; // preview image url
    /**
     * Contents via array
     */
    contents?:ArticleContent[]; // content (max.3?)
    /**
     * @todo mobile parse?
     */
    previewImage?:string;
    /**
     * Where article wrote?
     */
    categoryName?:string;
}
export interface ArticleContent<T extends InfoType = InfoType> {
    type:KeyType<T>,
    data:string,
    info:T,
    style:GeneralStyle & StyleType<T>,
}
export interface ImageType {
    src:string;
    width:number;
    height:number;
    name:string;
}
export interface UrlType {
    url:string;
}
export interface GeneralStyle {
    tagName:string;
    url:string;
    align:"left" | "center" | "right" | "undefined";
}
export interface TextStyle {
    bold:boolean;
    italic:boolean;
    namu:boolean;
    underline:boolean;
    size:number;
    textColor:string;
    backgroundColor:string;
    fontName:string;
    textAlign:"left" | "center" | "right" | "undefined";
    isTitle:boolean;
}
export interface ImageStyle {
    viewWidth:number;
    viewHeight:number;
}
// deprecated style.
export interface TextType {
    content:string;
}
export interface TableType {
    seperator:TableSeperator;
    isHead:boolean;
}
// Array<{content:string, style:TextStyle}>
export type KeyType<T extends InfoType> =
    T extends ImageType ? "image" :
    T extends TextType ? "text" | "newline" :
    T extends NaverVideo ? "nvideo" :
    T extends ytdl.videoInfo ? "youtube" :
    T extends TableType ? "table" :
    "embed" | "vote"
export type StyleType<T extends InfoType> =
    T extends TextType ? TextStyle :
    T extends ImageType ? ImageStyle :
    {}
export type InfoType = NaverVideo | ytdl.videoInfo | ImageType | UrlType | TextType | TableType | {}
export type ContentType = "embed" | "image" | "text" | "newline" | "vote" | "nvideo" | "youtube" | "table"
export enum TableSeperator {
    tableStart,
    rowStart,
    rowNext,
    // this means close row and \n.
    rowEnd,
    tableEnd,
}
