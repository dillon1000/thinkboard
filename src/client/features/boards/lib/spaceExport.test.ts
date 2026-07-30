import { describe, expect, it } from 'vitest'
import {
	createFlashcardAnkiText,
	createFlashcardCSV,
	safeExportFileName,
	type ExportFlashcard,
} from './spaceExport'

const cards: ExportFlashcard[] = [{
	alternateAnswers: ['Heat "spreads"', 'Higher multiplicity'],
	back: 'The number of compatible microstates.',
	front: 'What does entropy count?\nGive the statistical answer.',
	pageName: 'Week 4',
}]

describe('createFlashcardCSV', () => {
	it('quotes fields and preserves line breaks and alternate answers', () => {
		const csv = createFlashcardCSV(cards, 'Thermodynamics')

		expect(csv).toContain(
			'"What does entropy count?\nGive the statistical answer."'
		)
		expect(csv).toContain('"Heat ""spreads"" | Higher multiplicity"')
		expect(csv).toContain('"thinkspace thinkspace::Thermodynamics page::Week_4"')
	})
})

describe('createFlashcardAnkiText', () => {
	it('adds import headers, HTML-safe fields, a deck, and tags', () => {
		const text = createFlashcardAnkiText(cards, 'Thermo & Heat')

		expect(text).toContain('#separator:Tab')
		expect(text).toContain('#deck:Thermo & Heat')
		expect(text).toContain('#tags column:3')
		expect(text).toContain('What does entropy count?<br>Give the statistical answer.')
		expect(text).toContain('Heat &quot;spreads&quot;')
		expect(text).toContain('thinkspace::Thermo_Heat')
	})
})

describe('safeExportFileName', () => {
	it('keeps useful Unicode and removes path punctuation', () => {
		expect(safeExportFileName(' Física / Week 1: vectors ')).toBe('Física-Week-1-vectors')
	})
})
