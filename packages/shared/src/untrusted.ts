/**
 * Represents a JavaScript value before an owner validates its domain contract.
 * Boundary parsers accept this type and return narrower application types.
 */
export type UntrustedInput =
	| null
	| undefined
	| string
	| number
	| boolean
	| bigint
	| symbol
	| object

/** Return whether an untrusted value uses JavaScript's string representation. */
export function isString<Value>(value: Value): value is Value & string {
	return typeof value === 'string'
}

/** Return whether an untrusted value uses JavaScript's number representation. */
export function isNumber<Value>(value: Value): value is Value & number {
	return typeof value === 'number'
}

/** Return whether an untrusted value uses JavaScript's boolean representation. */
export function isBoolean<Value>(value: Value): value is Value & boolean {
	return typeof value === 'boolean'
}

/** Return whether an untrusted value is undefined. */
export function isUndefined<Value>(value: Value): value is Value & undefined {
	return typeof value === 'undefined'
}

/** Return whether an untrusted value uses JavaScript's object representation. */
export function hasObjectType<Value>(value: Value): value is Value & (object | null) {
	return typeof value === 'object'
}

/** Return whether an untrusted value is callable. */
export function isFunction<Value>(
	value: Value
): value is Value & ((...args: UntrustedInput[]) => UntrustedInput) {
	return typeof value === 'function'
}

/** Return whether an untrusted value uses JavaScript's bigint representation. */
export function isBigInt<Value>(value: Value): value is Value & bigint {
	return typeof value === 'bigint'
}

/** Return whether an untrusted value uses JavaScript's symbol representation. */
export function isSymbol<Value>(value: Value): value is Value & symbol {
	return typeof value === 'symbol'
}

/**
 * Read an unvalidated property without claiming an owner contract.
 * The function walks the prototype chain to match normal property access.
 */
export function readProperty<Value>(value: Value, key: PropertyKey): UntrustedInput {
	if (!hasObjectType(value) || value === null) return undefined
	let owner: object | null = value
	while (owner) {
		const descriptor = Object.getOwnPropertyDescriptor(owner, key)
		if (descriptor) {
			if ('value' in descriptor) return descriptor.value
			return descriptor.get?.call(value)
		}
		owner = Object.getPrototypeOf(owner)
	}
	return undefined
}
