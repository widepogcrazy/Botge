const url : string = "https://docs.google.com/spreadsheets/u/0/d/e/2PACX-1vSWIkcAv-1T59HWffSdJwn1P4m5Kp4hjIahweIbinW2uO1TPbv2AoYH4QJL5hXL339ll3xua8ir9E8g/pub?output=html";
const clipPattern : RegExp = /https:\/\/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/g;;

export async function listClipIds() : Promise<string[]> {
    const html = await (await fetch(url)).text();
    const matches = html.matchAll(clipPattern)
    return Array.from(html.matchAll(clipPattern), (m) => m[1]);
}