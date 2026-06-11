export default new class ApiClient {
  async single({ titles, episode }, options) {
    if(options.apiUrl === "") {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
    }

    if (!titles?.length) return []

    // altEpisode format, altSeason format
    const configs = [
      { altEpisode: false, altSeason: true },
      { altEpisode: false, altSeason: false },
      { altEpisode: true, altSeason: false},
      { altEpisode: true, altSeason: true },
    ]

    let results;
    for (let config of configs){

      let allResults = await Promise.all([
        this.findTorrentResults(titles, episode, options, { altTitle: false, ...config }), 
        this.findTorrentResults(titles, episode, options, { altTitle: true, ...config })
      ])
      
      results = allResults.flat()
      if(results && results.length > 0) {
        break;
      }
    }
    return results
  }

  batch = this.single
  movie = this.single

  async findTorrentResults(titles, episode, extensionOpts, opts){
    /**
     * titles:
     * 0: "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru? 2nd Season"
     * 1: "Saikyou no Ousama, Nidome no Jinsei wa Nani wo Suru? S2"
     * 2: "The Beginning After the End Season 2"
     * 3: "The Beginning After the End S2"
     * 4: "最強の王様、二度目の人生は 何をする? 第2期"
     * 5: "TBATE S2"
     * 6: "Начало после конца 2"
     */
    
    if(opts.altTitle && !titles[2].trim()) return []
    
    let title = opts.altTitle ? titles[2] : titles[0]
    
    let query = this.buildSearchQuery(title, episode, extensionOpts.useStrictSearchFirst, opts)
    console.log(query)
    let data = await this.fetchData(query, extensionOpts, extensionOpts.useStrictSearchFirst)

    if(extensionOpts.useStrictSearchFirst && data.results.length < 1) {
      query = this.buildSearchQuery(title, episode, false, opts)
      console.log(query)
      data = await this.fetchData(query, extensionOpts)
    }

    return this.map(data)
  }

  async fetchData(query, extensionOpts, strict = false) {
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": extensionOpts.apiKey || ""
    }

    const res = await fetch(`${extensionOpts.apiUrl}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term: query, pageSize: extensionOpts.resultsLimit ?? 10 }),
    });

    if (!res.ok) {
      if(res.status === 429){
        if(extensionOpts.apiKey !== "") {
          throw new Error("Invalid or incorrect API key!")
        }
        throw new Error("You cannot access this api without authorization! If you have an API key, make sure to put it in the extension settings!")
      }

      return { results: [], strict }
    };

    const data = await res.json()

    if (!Array.isArray(data)) return { results: [], strict }

    return { results: data, strict }
  }
  
  buildSearchQuery(title, episode, strict = false, opts) {
    let parsedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\p{P}\p{S}]/gu, ' ').trim();
    let parsedEpisode = episode.toString().padStart(2, '0');
    
    let parsedSeason
    let finalTitle = parsedTitle


    if(opts.altSeason){
      let { strippedTitle, seasonText } = this.stripSeason(parsedTitle)

      finalTitle = strippedTitle
      parsedSeason = seasonText
    } 
    
    let query = `"${finalTitle}"`;

    /*
     *
     * S1 main strict: "Kusuriya no Hitorigoto - 19 "
     * S1 main: "Kusuriya no Hitorigoto"" - 19 "
     * S1 altE strict: "Kusuriya no Hitorigoto 19 "
     * S1 altE: "Kusuriya no Hitorigoto"" 19 "
     * 
     * S2 main strict: "Tsue to Tsurugi no Wistoria Season 2 - 01 "
     * S2 main: "Tsue to Tsurugi no Wistoria"" Season 2 - 01 "
     * S2 altS strict: "Tsue to Tsurugi no Wistoria S2 - 01 "
     * S2 altS: "Tsue to Tsurugi no Wistoria"" S2 - 01 "
     * S2 altS altE strict: "Tsue to Tsurugi no Wistoria S2E01 "
     * S2 altS altE: "Tsue to Tsurugi no Wistoria"" S2E01 "
     * S2 altE strict: "Tsue to Tsurugi no Wistoria Season 2 E01 "
     * S2 altE: "Tsue to Tsurugi no Wistoria"" Season 2 E01 "
    */

    query += `" `

    if(parsedSeason) query += parsedSeason

    if (episode) query += `${opts.altEpisode ? `E` : `${parsedSeason ? " " : ""}- `}${parsedEpisode}`;

    query += ` "`

    if(strict) query = `"${query.replaceAll('"', "")}"`;

    return query.replace(/\s{2,}/g, ' ').trim();
  }

  stripSeason(input) {
      let seasonRegexes = [/Season\s+(\d+)/i, /(\d+)(?:st|nd|rd|th)\s*Season/i]

      let seasonNumber = null;
      let strippedTitle = input;

      for(let regex of seasonRegexes) {
        let match = input.match(regex)

        if(match){
          seasonNumber = match[1]
          strippedTitle = input.replace(regex, "").trim()
          break
        }
      }

      return {
          seasonText: seasonNumber ? `S${seasonNumber}` : "",
          seasonNumber,
          strippedTitle
      };
  }

  map(data) {
    return data.results.map(item => ({
      title: item.name || '',
      link: item.magnet || '',
      seeders: parseInt(item.seeders || '0'),
      leechers: parseInt(item.leechers || '0'),
      downloads: parseInt(item.completed || '0'),
      accuracy: data.strict ? 'high' : 'medium',
      hash: item.hash || '',
      size: item.filesize,
      date: new Date(item.date),
      type: /((\[|\()(batch|bd)|batch|bdrip)/i.test(item.name) ? "batch" : null
    }))
  }
  
  async test() {
    return true
  }
}()