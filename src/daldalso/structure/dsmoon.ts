import { Dcolor, Dstar, Dstatus, DuserId, Dwh, Dxy } from "./dsglobal"
import { DsLocaleInfo } from "./dslocaleinfo"

export default interface DsMoon {
    /**
     * Moon ID
     */
    id:number;
    /**
     * Owner's ID
     */
    userId:DuserId;
    /**
     * @todo fill
     */
    localeInfo:DsLocaleInfo;
    /**
     * Planet(행성) Position
     * 
     * [x, y]
     */
    planetPosition:Dxy;
    /**
     * Platnet(행성) Size (Database size maybe..)
     * 
     * [width, height]
     */
    planetSize:Dwh;
    /**
     * Planet(행성) Color
     * 
     * **maybe** [background, foreground]
     */
    planetColors:[Dcolor, Dcolor];
    /**
     * @todo fill
     */
    homeBoardId:null;
    /**
     * Sequence?
     */
    seq:number;
    /**
     * Status, 0
     */
    status:Dstatus;
    /**
     * APIName? "api"
     */
    name:string;
    /**
     * @todo wtf
     */
    baptismal:string;
    /**
     * Level with prev, next exp
     */
    star:Dstar;
    /**
     * @todo flying distance?
     */
    mileage:number;
    /**
     * 월석
     */
    moonstone:number;
    /**
     * Moon's position (in DB)
     * 
     * [x, y]
     */
    position:Dxy;
    /**
     * Moon's size
     * 
     * [width, height]
     */
    size:Dwh;
    velocity:[number, number];
    /**
     * Moon's color
     * 
     * #FFFFFF
     */
    color:Dcolor;
    /**
     * <3 in ncc?
     */
    cheers:number;
    /**
     * Created timestamp
     */
    createdAt:number;
}