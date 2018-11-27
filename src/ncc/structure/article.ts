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
export interface ArticleContent {
    type:ContentType,
    data:string,
    info?:InfoType,
}
export interface ImageType {
    src:string;
    width:number;
    height:number;
    name:string;
    linkURL:string; // Why I should implement this?????
}
export interface UrlType {
    url:string;
}
export interface TextStyle {
    bold:boolean;
    italic:boolean;
    namu:boolean;
    underline:boolean;
    url:string;
    size:number;
}
export interface TextType {
    content:string;
    style:TextStyle;
}
export interface TableType {
    /**
     * Column first
     * 
     * Row second
     */
    header:string[][];
    /**
     * Column first
     * 
     * Row second
     */
    body:string[][];
}
// Array<{content:string, style:TextStyle}>
export type InfoType = NaverVideo | ytdl.videoInfo | ImageType | UrlType | TextType[] | TextStyle | TableType
export type ContentType = "embed" | "image" | "text" | "newline" | "vote" | "nvideo" | "youtube" | "table"
