from nltk.tokenize import word_tokenize


dictionary = {}

infile = open("./data.txt", "r").readlines()

wordIdx = len(infile)//10

corpora = {}


for idx in range(0, wordIdx):
    data = infile[idx*10:idx*10+10]
    word = data[0].split()[0]
    corpora[word] = {
        "word": word,
        "sentiments": dict(map(lambda x: (x.split()[1], int(x.split()[2])), data))
    }

string = "hello my name is Diego and I'm ecstactic to be here."

counter = {}

def analysis(text):
    words = [word.lower() for word in word_tokenize(text) if word.isalpha()]
    for word in words:
        if word not in corpora:
            # print("Couldn't find word, %s", word)
            continue
        print('found word %s, %s', word, corpora[word]["sentiments"])
        for sentiment, value in corpora[word]["sentiments"].items():
            if sentiment not in counter:
                counter[sentiment]  = value
            else:
                counter[sentiment] += value
    print(counter)
    print(words)
    return counter
