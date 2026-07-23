import type { FlashcardProposal } from '@agentboard/shared'
import { createChat } from '@shadcn/helpers/ai-sdk'

type StudyFixtureTools = {
	createFlashcards: {
		input: FlashcardProposal
		output: { applied: boolean }
	}
}

type StudyFixtureData = {
	selection: {
		count: number
		status: 'reading' | 'ready'
	}
}

export const studyChatFixture = createChat<unknown, StudyFixtureData, StudyFixtureTools>({
	messageIdPrefix: 'study-message',
	toolCallIdPrefix: 'study-tool',
	now: '2026-07-19T12:00:00.000Z',
})
	.user('Turn the selected derivative notes into flashcards.', { id: 'study-user-flashcards' })
	.sleep(20)
	.assistant(({ writer }) => {
		writer.data({
			type: 'data-selection',
			id: 'selected-work',
			data: { count: 3, status: 'reading' },
			transient: true,
		})
		writer.reasoning('The selection contains a definition, notation, and one application.')
		writer.stepStart()
		writer.text('I prepared **three flashcards** from the selected work.')
		writer.data({
			type: 'data-selection',
			id: 'selected-work',
			data: { count: 3, status: 'ready' },
		})
		writer
			.tool('createFlashcards', {
				title: 'Creating flashcards',
				input: {
					x: 920,
					y: 630,
					cards: [
						{ front: 'What does a derivative measure?', back: 'Instantaneous rate of change.' },
						{ front: 'How is a derivative written?', back: "Using notation such as f'(x)." },
						{ front: 'What is one use of derivatives?', back: 'Finding maxima and minima.' },
					],
				},
			})
			.sleep(20)
			.output({ applied: true })
	})
