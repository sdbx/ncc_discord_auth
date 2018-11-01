import Cafe from "./cafe"
import Comment from "./comment"

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
    attaches:string[]; // attach file urls
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
     * Thinking
     */
    previewImage?:string;
}
export interface ArticleContent {
    type:ContentType,
    data:string,
    info?:unknown,
}
export type ContentType = "embed" | "image" | "text" | "newline" | "url" | "vote" | "nvideo"