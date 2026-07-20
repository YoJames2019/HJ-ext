export default new class ApiClient {
  async single({ media, episode }, options) {
    if(options.apiUrl === "") {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
    }

    if (!media.title) return []

    let allResults = await Promise.all([
      this.findTorrentResults(media.title, episode, options, { altTitle: false }), 
      this.findTorrentResults(media.title, episode, options, { altTitle: true })
    ])

    return allResults.flat()
  }

  batch = () => [];
  movie = () => [];

  async findTorrentResults(titles, episode, extensionOpts, opts){
    /**
     * titles:
     *   english: "Petals of Reincarnation"
     *   native: "リィンカーネーションの花弁"
     *   romaji: "Reincarnation no Kaben"
     *   userPreferred: "Petals of Reincarnation"
     */
    if(opts.altTitle && !titles.english) return []

    let title = opts.altTitle ? titles.english : titles.romaji
    
    let query = this.buildSearchQuery(title, episode, extensionOpts.useStrictSearchFirst)
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
  
  buildSearchQuery(title, episode, strict = false) {
    let parsedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\p{P}\p{S}]/gu, ' ').trim();
    let parsedEpisode = episode.toString().padStart(2, '0');

    let res = this.stripSeason(parsedTitle)
    
    let seasonNumber = res.seasonNumber
    let finalTitle = res.strippedTitle

    let query;

    if (strict) {
      query = `"${finalTitle} ${seasonNumber ? `Season ${seasonNumber} ` : ""}- ${parsedEpisode}"`;
    }
    else {
        let combos = this.genSeasonTitleEpisodeCombinations(finalTitle, seasonNumber, parsedEpisode)

        query = combos.map(r => `"${r}"`).join("|")
    }

    return query;
  }

  genSeasonTitleEpisodeCombinations(titles, seasonNumber, episode) {

    if(!Array.isArray(titles)) titles = [titles]

    let seasonVariations = ["{num}{suffix} Season {sep}", "S{num}{sep}", "Season {num} {sep}"]
    let episodeSeparators = ["E", " - "]

    let finalCombos = []
    let seasonCombos = []

    if(!seasonNumber) seasonNumber = 1

    for (let title of titles){
        if(title.includes(":")) titles.push(title.split(":")[0])

        for (let variationTemplate of seasonVariations) {
            let variationStr = variationTemplate.replace("{num}", seasonNumber).replace("{suffix}", this.getSuffix(seasonNumber))
            let str = `${title} ${variationStr}`
            seasonCombos.push(str)
        }
    
        if (seasonNumber === 1) {
            seasonCombos.push(`${title} {sep}`)
        }
    }

    for (let separator of episodeSeparators){
        for(let comboIndex in seasonCombos){
            finalCombos.push(`${seasonCombos[comboIndex].replace("{sep}", separator)}${String(episode).padStart(2, "0")} `.replace(/[ ]{2,}/g, " "))
        }
    }

    return finalCombos
  }

  getSuffix(input){
    switch(input){
      case 1:
        return "st"
      case 2:
        return "nd"
      case 3:
        return "rd"
      default:
        if(input > 0){
          return "th"
        }
        return ""
    }
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