export default new class ApiClient {
  async single({ titles, episode }, options) {
    if(options.apiUrl === "") {
      throw new Error("You must specify the base url of the third party nyaa.si api you are using in settings\n\nExample (not functional): https://nyaasi.yourwebsite.net")
    }

    if (!titles?.length) return []

    let query = this.buildSearchQuery(titles[0], episode, options.useStrictSearchFirst)

    let data = await this.fetchData(query, options)

    if(options.useStrictSearchFirst && !data.length < 0) {
      query = this.buildSearchQuery(titles[0], episode)
      data = await this.fetchData(query, options)
    }

    return this.map(data)
  }

  batch = this.single
  movie = this.single

  async fetchData(query, options) {
    const headers = {
      "Content-Type": "application/json",
    }

    if(options.apiKey !== ""){
      headers["X-API-Key"] = options.apiKey
    }

    const res = await fetch(`${options.apiUrl}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ term: query, pageSize: options.resultsLimit ?? 10 }),
    });

    if (!res.ok) {
      if(res.status === 429){
        if(options.apiKey !== "") {
          throw new Error("Invalid or incorrect API key!")
        }
        throw new Error("You cannot access this api without authorization! If you have an API key, make sure to put it in the extension settings!")
      }

      return []
    };

    const data = await res.json()

    if (!Array.isArray(data)) return []

    return data
  }
  
  buildSearchQuery(title, episode, strict = false) {
    const parsedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, ' ').trim()
    const parsedEpisode = episode.toString().padStart(2, '0')

    let query = `"${parsedTitle}"`
    if (episode) query += ` "${parsedEpisode} "`

    if(strict) query = `"${query.replaceAll('"', "")}"`

    return query
  }

  map(data) {
    return data.map(item => ({
      title: item.name || '',
      link: item.magnet || '',
      seeders: parseInt(item.seeders || '0'),
      leechers: parseInt(item.leechers || '0'),
      downloads: parseInt(item.completed || '0'),
      accuracy: 'medium',
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