package net.tarks.craftingmod.nccauth;

public class Config {
    public long cafeID;
    public long articleID;
    public String discordToken;
    public long discordChannelID;
    public Config(long cid,long aid, String discord_token, long discord_channelID){
        cafeID = cid;
        articleID = aid;
        discordToken = discord_token;
        discordChannelID = discord_channelID;
    }
    public void setID(long cfID,long arID){
        cafeID = cfID;
        articleID = arID;
    }
}
