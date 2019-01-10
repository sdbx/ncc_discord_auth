import DsMoon from "./structure/dsmoon"
import DsTerrain from "./structure/dsterrain"

export interface DPKWelcome {
    /**
     * Daldalso version string
     */
    version:string;
    /**
     * Having moons
     */
    moons:DsMoon[];
}
export interface DPKWelcomeMoon {
    moon:DsMoon,
    terrains:DsTerrain[],
}
/**
 * Daldalso PacKet Server-side response 
 */
interface DPKServer {
    /**
     * On server o/
     */
    "welcome":DPKWelcome;
    /**
     * 
     */
    "welcome-moon":DPKWelcomeMoon;
}
/**
 * Daldalso PacKet Client-side request
 */
export interface DPKClient {
    /**
     * On Select moon when welcome
     */
    "moon-selection":number;
}
/**
 * Event Lifecycle
 * 
 * 1. Welcome (server)
 * 
 * 2. moon-selection (client)
 */
// tslint:disable-next-line
export type DPKPair = DPKServer & DPKClient
export interface DPK<T extends keyof DPKPair = keyof DPKPair> {
    type:T;
    data:DPKPair[T];
}
export interface DPKBase {
    type:keyof DPKPair;
    data:unknown;
}