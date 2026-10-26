// Test fixture: a small unit shaped like `GET /api/units/1`.
import type { UnitDetail } from "@english-course/shared";

export function unitFixture(): UnitDetail {
  return {
    number: 1,
    title: "Present continuous",
    subtitle: "I am doing",
    block: { id: 1, title: "Present and past" },
    theory: [
      {
        letter: "A",
        html: '<p>She <strong class="grammar-target">is driving</strong> to work.</p>',
      },
    ],
    extras: {
      puzzle: {
        sentenceA: "I'm reading a great book.",
        sentenceB: "(Said at a party.)",
        question: "Is the sentence still correct?",
        revealEs: "Sí, es correcta: está en curso estos días.",
      },
      analogyEs: "Es como un proceso RUNNING.",
      pitfalls: [
        { wrong: "Look! It rains.", right: "Look! It's raining.", explanationEs: "Ahora mismo." },
        { wrong: "I am study.", right: "I'm studying.", explanationEs: "Falta -ing." },
        { wrong: "I'm agree.", right: "I agree.", explanationEs: "Agree es un verbo." },
      ],
      canDoEs: ["Puedo contar lo que está pasando ahora."],
    },
    story: {
      title: null,
      chapter: {
        id: "b1-c1",
        position: 1,
        title: "Live from Space",
        body: "Three astronauts are flying to the Moon.\n\nThe Earth is getting smaller.",
        grammarSpans: [{ text: "are flying", unitId: 1, note: "Action in progress." }],
        teaser: "Two minutes later, nothing will be ordinary again.",
      },
    },
    timeline: [{ id: "tl-1-1", sentence: "Fred is floating through the tunnel right now." }],
    exercises: [
      {
        id: "1.1",
        instruction: "Complete the sentences.",
        evaluation: "auto",
        wordBank: [
          { text: "look", used: false },
          { text: "work", used: true },
        ],
        passage: null,
        answerNote: null,
        items: [
          {
            id: "1.1-1",
            num: "1.",
            isExample: true,
            isOpen: false,
            kind: null,
            lines: [
              [
                { type: "text", text: "You " },
                { type: "example", text: "'re working" },
                { type: "text", text: " hard today." },
              ],
            ],
          },
          {
            id: "1.1-2",
            num: "2.",
            isExample: false,
            isOpen: false,
            kind: "blanks",
            lines: [
              [
                { type: "text", text: "I " },
                { type: "blank", id: "1.1-2-1", size: "long" },
                { type: "text", text: " for Christine." },
              ],
            ],
          },
        ],
      },
    ],
    progress: {
      status: "not-started",
      completedAt: null,
      completion: { graded: 0, correct: 0, almost: 0, pending: 0, ratio: 0, completed: false },
      items: [],
    },
  };
}
