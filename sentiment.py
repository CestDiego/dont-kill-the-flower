from transformers import pipeline


# sentimentData['score'] += (label === 'POSITIVE' ? 1 : -1 * NEG_MULTIPLIER) * score
# console.log(sentimentData)
# isForward = sentimentData.score < 0
# // document.querySelector('#transcript').textContent += ' ' + received
# MULTIPLIER = Math.max(Math.min(
#   Math.log(Math.abs(sentimentData.score) + 4)/Math.log(4), 3), 1) // log(score) in base 4
class SentimentAnalyzer:
    """A class for sentiment Analysis.
    """

    sentiment_pipeline = pipeline("sentiment-analysis")
    times_said_sorry = 0
    NEG_MULTIPLIER = 1.5
    score = 0

    def analysis(self, text):
        """Analyze the text."""
        if "I'm sorry" in text:
            self.times_said_sorry += 1
            self.score = 10 / self.times_said_sorry
            return self
        data = self.sentiment_pipeline(text)
        print(text)
        print(data)
        is_positive = data[0]["label"] == "POSITIVE"
        self.score += (1 if is_positive else -1 * self.NEG_MULTIPLIER) * data[0]["score"]
        return self
