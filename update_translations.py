from __future__ import annotations

import json
import time
from pathlib import Path

from deep_translator import GoogleTranslator


DATA_PATH = Path(__file__).resolve().parent / "data" / "questions.json"
TARGET_LANGUAGES = ("en", "ru")
SOURCE_KEY = "text_es"
TARGET_KEYS = {
    "en": "text_en",
    "ru": "text_ru",
}
CHUNK_SIZE = 200
MAX_CHUNK_CHARACTERS = 4500
SEPARATOR = "\n[[[PDD_TRANSLATION_SEPARATOR]]]\n"
RETRY_DELAY_SECONDS = 2
MAX_ATTEMPTS = 3


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def length_limited_chunks(items: list[str]) -> list[list[str]]:
    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    current_length = 0

    for item in items:
        item_length = len(item)
        separator_length = len(SEPARATOR) if current_chunk else 0

        if current_chunk and (
            len(current_chunk) >= CHUNK_SIZE
            or current_length + separator_length + item_length > MAX_CHUNK_CHARACTERS
        ):
            chunks.append(current_chunk)
            current_chunk = []
            current_length = 0
            separator_length = 0

        if item_length > MAX_CHUNK_CHARACTERS:
            raise RuntimeError(
                f"Source text is too large to translate in one request: {item_length} characters"
            )

        current_chunk.append(item)
        current_length += separator_length + item_length

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def translate_chunk(translator: GoogleTranslator, texts: list[str]) -> list[str]:
    combined_text = SEPARATOR.join(texts)
    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            translated_text = translator.translate(combined_text)
            translated_parts = translated_text.split(SEPARATOR)
            if len(translated_parts) != len(texts):
                raise RuntimeError(
                    f"Unexpected split count: expected {len(texts)}, got {len(translated_parts)}"
                )
            return translated_parts
        except Exception as error:
            last_error = error
            if attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_DELAY_SECONDS * attempt)
    if last_error is None:
        raise RuntimeError("Translation failed without an exception")
    raise last_error


def gather_unique_source_texts(questions: list[dict]) -> list[str]:
    unique_texts: dict[str, None] = {}

    def add_text(value: str | None) -> None:
        if value and value not in unique_texts:
            unique_texts[value] = None

    for question in questions:
        add_text(question["question"].get(SOURCE_KEY))
        for answer in question.get("answers", []):
            add_text(answer.get(SOURCE_KEY))
        add_text(question["explanation"].get(SOURCE_KEY))

    return list(unique_texts.keys())


def build_translation_map(source_texts: list[str], language: str) -> dict[str, str]:
    translator = GoogleTranslator(source="es", target=language)
    translations: dict[str, str] = {}
    text_chunks = length_limited_chunks(source_texts)

    for index, batch in enumerate(text_chunks, start=1):
        translated_batch = translate_chunk(translator, batch)
        if len(translated_batch) != len(batch):
            raise RuntimeError(
                f"Unexpected translation count for {language}: "
                f"expected {len(batch)}, got {len(translated_batch)}"
            )
        translations.update(zip(batch, translated_batch))
        print(
            f"{language}: translated batch {index}/{len(text_chunks)}"
        )

    return translations


def apply_translations(questions: list[dict], language_maps: dict[str, dict[str, str]]) -> None:
    for question in questions:
        source_question = question["question"].get(SOURCE_KEY)
        if source_question:
            for language, translated_texts in language_maps.items():
                question["question"][TARGET_KEYS[language]] = translated_texts[source_question]

        for answer in question.get("answers", []):
            source_answer = answer.get(SOURCE_KEY)
            if not source_answer:
                continue
            for language, translated_texts in language_maps.items():
                answer[TARGET_KEYS[language]] = translated_texts[source_answer]

        source_explanation = question["explanation"].get(SOURCE_KEY)
        if source_explanation:
            for language, translated_texts in language_maps.items():
                question["explanation"][TARGET_KEYS[language]] = translated_texts[source_explanation]


def main() -> None:
    with DATA_PATH.open("r", encoding="utf-8") as file:
        questions = json.load(file)

    source_texts = gather_unique_source_texts(questions)
    print(f"Found {len(source_texts)} unique Spanish strings to translate")

    language_maps = {
        language: build_translation_map(source_texts, language)
        for language in TARGET_LANGUAGES
    }
    apply_translations(questions, language_maps)

    with DATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(questions, file, ensure_ascii=False, indent=2)
        file.write("\n")

    print(f"Updated translations in {DATA_PATH}")


if __name__ == "__main__":
    main()