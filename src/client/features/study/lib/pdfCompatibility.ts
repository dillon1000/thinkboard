interface PromiseResolvers<T> {
	promise: Promise<T>
	reject: (reason?: unknown) => void
	resolve: (value: T | PromiseLike<T>) => void
}

type CompatiblePromiseConstructor = PromiseConstructor & {
	withResolvers?: <T>() => PromiseResolvers<T>
}

type CompatibleAbortSignalConstructor = typeof AbortSignal & {
	any?: (signals: readonly AbortSignal[]) => AbortSignal
}

export function ensurePDFCompatibility() {
	const promiseConstructor = Promise as CompatiblePromiseConstructor
	promiseConstructor.withResolvers ??= createPromiseResolvers

	const abortSignalConstructor = AbortSignal as CompatibleAbortSignalConstructor
	abortSignalConstructor.any ??= combineAbortSignals
}

function createPromiseResolvers<T>(): PromiseResolvers<T> {
	let resolve!: PromiseResolvers<T>['resolve']
	let reject!: PromiseResolvers<T>['reject']
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

function combineAbortSignals(signals: readonly AbortSignal[]) {
	const controller = new AbortController()
	const listeners = new Map<AbortSignal, () => void>()
	const abortFrom = (signal: AbortSignal) => {
		for (const [registeredSignal, listener] of listeners) {
			registeredSignal.removeEventListener('abort', listener)
		}
		listeners.clear()
		controller.abort(Reflect.get(signal, 'reason'))
	}

	for (const signal of signals) {
		if (signal.aborted) {
			abortFrom(signal)
			break
		}
		const listener = () => abortFrom(signal)
		listeners.set(signal, listener)
		signal.addEventListener('abort', listener, { once: true })
	}
	return controller.signal
}
