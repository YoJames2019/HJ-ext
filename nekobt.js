
const CUSTOM_EPOCH = BigInt("1735689600000");

function decodeId(encodedId) {
  const id = BigInt(encodedId);
  const time = Number((id >> 8n) + CUSTOM_EPOCH);
  const type = Number((id >> 4n) & 15n);
  const increment = Number(id & 15n);
  return { time, type, increment };
}

export default new class NekoBT {
    url = atob("aHR0cHM6Ly9uZWtvYnQudG8vYXBpL3YxLw==");

    async fetchEpisodeFromId({ tvdbId, tmdbId, imdbId }) {
        const mappingRes = await fetch(
            atob("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1RoYVVua25vd24vYW5pbWUtbGlzdHMtdHMvcmVmcy9oZWFkcy9tYWluL2RhdGEvbmJ0LW1hcHBpbmcuanNvbg==")
        )
        console.log(`tvdbid: ${tvdbId}, tmdbid: ${tmdbId}, imdbid: ${imdbId}`)
        const mappings = await mappingRes.json()

        const nekoID = mappings.tvdb[tvdbId] ?? mappings.tmdb[tmdbId] ?? mappings.imdb[imdbId];
        if (!nekoID) return {};
        const res = await fetch(this.url + `media/${nekoID}`)
        
        const json = await res.json();
        if (json.error) throw new Error("NekoBT: " + json.message);
        return { nekoID, data: json.data };
    }
    
    mapResults(res) {
        return (
            res?.data?.results?.map((result) => ({
                title: result.title,
                link: `https://nekobt.to/api/v1/torrents/${result.id}/download?public=true`,
                seeders: Number(result.seeders),
                leechers: Number(result.leechers),
                downloads: Number(result.completed),
                hash: result.infohash,
                size: Number(result.filesize),
                accuracy: "high",
                type: (result.level ?? 0) >= 3 ? "alt" : void 0,
                date: new Date(decodeId(result.id).time),
            })) ?? []
        );
    }

    async single({ tvdbId, tvdbEId, tmdbId, imdbId, episode }, i) {
        if (!navigator.onLine) return [];
        if (!tvdbId && !tmdbId && imdbId) return []

        const nekoMapping = await this.fetchEpisodeFromId({ tvdbId, tmdbId, imdbId })
        if(!nekoMapping) return [];

        const episodeData = nekoMapping.data?.episodes?.find((e) => e.tvdbId === tvdbEId) ?? nekoMapping.data?.episodes?.find((e) => e.episode === episode);
        let URL = `${this.url}torrents/search?media_id=${nekoMapping.nekoID}&fansub_lang=en%2Cenm&sub_lang=en%2Cenm`;
        episodeData?.id && (URL += `&episode_ids=${episodeData.id}`);
        const res = await fetch(URL)
        
        const json = await res.json();
        if (json.error) throw new Error("NekoBT: " + json.message);
        return this.mapResults(json);
    }
    batch = this.single;
    movie = this.single;
    async test() {
        try {
            if (!(await fetch(this.url + "announcements")).ok) throw new Error(`Failed to load data from ${this.url}! Is the site down?`);
            return true;
        } catch (err) {
            throw new Error(`Could not reach ${this.url}! Does the site work in your region?`);
        }
    }
}();
