import {
	registerCanvasCustomColors,
	studyShapeSchemas,
} from '@agentboard/shared'
import {
	createTLSchema,
	defaultBindingSchemas,
	defaultShapeSchemas,
} from '@tldraw/tlschema'

// Registration must happen before schema creation because the sync server validates every record.
registerCanvasCustomColors()

export const boardSchema = createTLSchema({
	shapes: { ...defaultShapeSchemas, ...studyShapeSchemas },
	bindings: defaultBindingSchemas,
})
