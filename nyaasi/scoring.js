class Scoring {
    static jaroWinkler(first, second) {
        if (first === second) return 1;
        if (!first.length || !second.length) return 0;

        // match window size
        const matchWindow = Math.max(0,
            Math.floor(
                Math.max(first.length, second.length) / 2
            ) - 1
        )

        // array of values denoting whether each char in the string has a designated match in the other string, filled with false initially
        const firstMatched = new Array(first.length).fill(false)
        const secondMatched = new Array(second.length).fill(false)

        let matchCount = 0

        for (let i = 0; i < first.length; i++) {
            const windowStart = Math.max(0, i - matchWindow)
            const windowEnd = Math.min(second.length, i + matchWindow + 1)

            for (let j = windowStart; j < windowEnd; j++) {
                if (!secondMatched[j] && first[i] === second[j]) {
                    firstMatched[i] = secondMatched[j] = true;
                    matchCount++;
                    break
                }
            }
        }


        if (matchCount === 0) return 0;

        let transpositions = 0;
        let secondIndex = 0;

        for (let i = 0; i < first.length; i++) {
            if (!firstMatched[i]) continue;

            while (!secondMatched[secondIndex]) secondIndex++;
            if (first[i] !== second[secondIndex]) transpositions++;
            secondIndex++;
        }

        transpositions /= 2;

        const A = matchCount / first.length
        const B = matchCount / second.length
        const C = (matchCount - transpositions) / matchCount

        const jaro = (A + B + C) / 3

        // check how many chars match at the beginning of the string and apply a slight bias favoring it
        let commonPrefix = 0;
        for (let i = 0; i < Math.min(4, first.length, second.length); i++) {
            if (first[i] === second[i]) {
                commonPrefix++;
            }
            else {
                break;
            }
        }

        return jaro + (commonPrefix * 0.1) * (1 - jaro)
    }
}

export default Scoring;