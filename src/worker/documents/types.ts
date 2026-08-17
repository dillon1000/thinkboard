interface DocumentPipelineMessageBase {
	boardID: string
	documentID: string
	ownerID: string
}

export interface DocumentIndexMessage extends DocumentPipelineMessageBase {
	kind?: 'document-index'
}

export interface OfficeConversionMessage extends DocumentPipelineMessageBase {
	kind: 'office-conversion'
}

export type DocumentPipelineMessage = DocumentIndexMessage | OfficeConversionMessage
