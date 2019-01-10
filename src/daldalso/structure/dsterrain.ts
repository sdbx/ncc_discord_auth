import { Dstar, Dwh, Dxy } from "./dsglobal"
import { DsLocaleInfo } from "./dslocaleinfo"

export default interface DsTerrain {
    /**
     * Terrain ID
     */
    id:number,
    /**
     * @todo ??
     */
    staticId:string,
    /**
     * moon's division
     */
    moonSeq:number,
    /**
     * @todo ??
     */
    terrainId:null,
    /**
     * @todo ??
     */
    localeInfo:DsLocaleInfo,
    /**
     * Terrain Group.. what?
     * 
     * TRR
     */
    group:string,
    /**
     * Subgroup.. what?
     * 
     * hq
     */
    subgroup:string,
    /**
     * 5 star card~
     */
    rarity:string,
    /**
     * @todo ??
     */
    moonstone:null,
    /**
     * @todo ??
     */
    lunaria:null,
    /**
     * Terrain Size!
     */
    size:Dwh,
    options:{
        board:{
            stub:number,
            normal:number,
        }
        power:number,
        sight:number,
        tense:boolean,
        gather:number,
    },
    requisites:{},
    quantity:null,
    star:Dstar,
    mileage:number,
    minutes:[null, number],
    position:Dxy,
    rotation:number,
    state:{},
    createdAt:number,
    updatedAt:number,
}