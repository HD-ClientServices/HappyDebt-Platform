# Audio Transcription for Call Recordings

## Provider Comparison

| Feature | OpenAI Whisper | Deepgram Nova-3 |
|---------|---------------|-----------------|
| File size limit | **25 MB** (hard limit) | **~2 GB** (practical) |
| Pricing | ~$0.006/min | ~$0.0043/min |
| Language detection | Manual (`language=en`) | Auto (`language=multi`) |
| Speed | Moderate | Fast |
| n8n integration | Native node available | HTTP Request node |
| Large file handling | Requires truncation/compression | Just works |

### Recommendation: Deepgram

For call recording pipelines, **Deepgram is strongly preferred** because:
1. No 25 MB file size limit — handles 50+ MB recordings without any workaround
2. Automatic language detection with `language=multi` — handles English, Spanish, and other languages
3. Cheaper per minute
4. Faster processing

### Why NOT Whisper

Whisper's 25 MB limit is a fundamental problem for call recordings:
- Phone recordings at ~0.96 MB/min means the limit is ~26 minutes
- Longer calls (30-50+ min) require truncation, losing important content
- GHL sometimes ignores Range headers, returning files larger than requested
- Compression/conversion requires FFmpeg which isn't available on n8n cloud
- Processing audio in n8n Code nodes causes OOM for files >15 MB

## Deepgram Integration

### API Endpoint

```
POST https://api.deepgram.com/v1/listen
Authorization: Token {DEEPGRAM_API_KEY}
Content-Type: audio/wav
Body: [binary audio data]

Query Parameters:
  model=nova-3          # Latest and best model
  smart_format=true     # Formats numbers, currency, etc.
  language=multi        # Auto-detect language (recommended)
```

### Response Structure

```json
{
  "metadata": {
    "transaction_key": "...",
    "request_id": "...",
    "duration": 1312.0874,
    "channels": 1,
    "models": ["..."],
    "model_info": {...}
  },
  "results": {
    "channels": [
      {
        "detected_language": "es",
        "alternatives": [
          {
            "transcript": "The full transcription text...",
            "confidence": 0.88,
            "words": [
              { "word": "Hello", "start": 0.0, "end": 0.5, "confidence": 0.99 }
            ],
            "paragraphs": {...}
          }
        ]
      }
    ]
  }
}
```

### Extracting the Transcript

```javascript
const transcript = response.results.channels[0].alternatives[0].transcript;
const detectedLanguage = response.results.channels[0].detected_language;
const duration = response.metadata.duration;
const confidence = response.results.channels[0].alternatives[0].confidence;
```

## Language Handling

### The Spanish Call Problem

When `language=en` is hardcoded and the call is in Spanish, Deepgram attempts to
force-fit Spanish audio into English phonemes. The result:
- Only ~46 words detected in a 22-minute call
- Output is fragments: "Okay. Yeah. Correct. Perfect."
- High confidence (0.88) but complete garbage — Deepgram is "confident" those
  few English-sounding words are correct

### Solution: `language=multi`

Using `language=multi` enables automatic language detection. Deepgram:
1. Detects the language from the audio
2. Uses the appropriate model
3. Returns `detected_language` field (e.g., "es" for Spanish)
4. Transcribes correctly in the detected language

### QA Analysis in English

When the transcript is in Spanish but the QA analysis should be in English,
add this instruction to the QA prompt:

```
Language: ALWAYS write the ENTIRE analysis in English, regardless of the transcript
language. This includes: Diagnosis, Prescribed Fix, Priority Action Items, The Critical
Moment, Closing Intelligence, and all commentary. The ONLY exception: Client Signal and
Rep Response quotes must remain in the original transcript language (they are direct
evidence). Everything else — every word you write — must be in English. No exceptions.
```

## Content-Type Considerations

GHL recordings come with `Content-Type: audio/x-wav` and filename `audio.mp3`.
The actual encoding is compressed (likely MP3 despite the WAV mime type).

When sending to Deepgram, use `Content-Type: audio/wav` — Deepgram auto-detects
the actual encoding regardless of the declared content type.

## Scoring Extraction from QA Output

When OpenAI generates QA analysis with markdown tables, the scoring regex must
handle variable whitespace:

```javascript
// Pattern for extracting scores from markdown table:
// | Pillar Name | 4/10  | 🔴 Poor | Impact text |
const scoreRegex = /\| .+ \| (\d+)\/10\s*\|/g;
const matches = [...qaMarkdown.matchAll(scoreRegex)];
const scores = matches.map(m => parseInt(m[1]));
```

**Critical:** Use `\s*\|` (not ` \|`) after `/10` because OpenAI varies the number
of spaces in table column padding. A single-space match will return 0 scores
when there are 2+ spaces.
