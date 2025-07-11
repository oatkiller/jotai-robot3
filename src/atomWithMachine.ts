/* eslint @typescript-eslint/no-explicit-any: off */

import type { Getter, WritableAtom } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';
import {
	interpret,
	type Service,
	type Machine,
	type GetMachineTransitions,
	type SendEvent
} from 'robot3';

import { RESTART, isGetter, type Gettable } from './utils.ts';

// Generic service helper that additionally exposes an optional `stop` method
// (Robot3 only exposes this when the machine contains invoked children).
type AnyService<M extends Machine = Machine> = Service<M> & {
	stop?: () => void;
};

// Helper type for events that can be sent to the service derived from the
// machine's transition names.
export type RobotEvent<M extends Machine> = SendEvent<GetMachineTransitions<M>>;

// Internal atoms are marked as private in development so they don't clutter
// React DevTools when using the official Jotai DevTools extension.
const markPrivate = (a: any) => {
	if (process.env.NODE_ENV !== 'production') {
		a.debugPrivate = true;
	}
};

// The public API – heavily inspired by jotai-xstate's `atomWithMachine`.
// ---------------------------------------------------------------------
//
// Example usage:
// const machine = createMachine({ ... }, () => ({ ...context }));
// const counterAtom = atomWithMachine(() => machine);
//
// Inside React:
// const [state, send] = useAtom(counterAtom);
//
// `state` is the live `service.machine` reference and will update whenever the
// machine transitions. Use `state.current` to read the current state value or
// `state.context` for extended state.
export function atomWithMachine<M extends Machine>(
	getMachine: Gettable<M>,
	getInitialContext?: Gettable<M['context']>
): WritableAtom<AnyService<M>, [RobotEvent<M> | typeof RESTART], void> {
	// Holds a reference to the currently running Robot service (or `null` before
	// lazy init / after restart).
	const cachedServiceAtom = atom<AnyService<M> | null>(null);
	markPrivate(cachedServiceAtom);

	// Stores the latest machine snapshot so that reads are synchronous.
	const cachedSnapshotAtom = atom<AnyService<M> | null>(null);
	markPrivate(cachedSnapshotAtom);

	// Responsible for creating the service, wiring up the onChange listener and
	// cleaning everything up on unmount.
	const snapshotAtom = atom(
		(get) => {
			const snapshot = get(cachedSnapshotAtom);
			if (snapshot) return snapshot;
			return get(cachedServiceAtom);
		},
		(
			get,
			set,
			registerCleanup: ((cleanup: () => void) => void) | undefined
		) => {
			const reg = registerCleanup ?? (() => {});
			// If there's already a service running we just (re)register the listener.
			let service = get(cachedServiceAtom);
			if (!service) {
				// Lazily construct new service now that we have access to `set`.
				const safeGet: typeof get = (...args) => get(...args);
				const machine = isGetter(getMachine)
					? getMachine(safeGet)
					: getMachine;
				const initialCtx = isGetter(getInitialContext)
					? getInitialContext(safeGet)
					: getInitialContext;

				service = interpret(
					machine,
					(svc) => {
						set(cachedSnapshotAtom, svc);
					},
					initialCtx as M['context']
				);
				set(cachedServiceAtom, service);
				// Prime the snapshot with the initial service.
				set(cachedSnapshotAtom, service);
			}

			// Register cleanup that stops the service when Atom is unmounted (e.g.
			// when no component is subscribed to it anymore).
			reg(() => {
				const current = get(cachedServiceAtom);
				if (current?.stop) {
					current.stop();
				}
				set(cachedServiceAtom, null);
				set(cachedSnapshotAtom, null);
			});
		}
	);

	// Ensure the snapshotAtom initializes the service when first mounted.
	snapshotAtom.onMount = (initialize) => {
		let unsub: (() => void) | undefined | false;

		initialize((cleanup) => {
			if (unsub === false) {
				cleanup();
			} else {
				unsub = cleanup;
			}
		});

		return () => {
			if (unsub) unsub();
			unsub = false;
		};
	};

	// Expose `[snapshot, send]` style API via a single writable atom similar to
	// jotai-xstate. Reading returns the latest snapshot, writing forwards events
	// to the underlying Robot service.
	const machineStateAtom = atom<AnyService<M>, [RobotEvent<M> | typeof RESTART], void>(
		(get) => get(snapshotAtom) as AnyService<M>,
		(get, set, event) => {
			const service = get(cachedServiceAtom);
			if (!service) return; // not mounted yet

			if (event === RESTART) {
				// robot3's service does not expose a stop method; guard it for future-proofing
				if ('stop' in service && typeof service.stop === 'function') {
					service.stop();
				}
				set(cachedServiceAtom, null);
				set(cachedSnapshotAtom, null);
				// Trigger lazy re-initialisation on next read.
				// Pass an explicit undefined to satisfy WritableAtom setter types.
				set(snapshotAtom, () => {});
			} else {
				// event here is narrowed to RobotEvent<M> by the if-guard above
				service.send(event as RobotEvent<M>);
				// No need to manually update snapshot – `onChange` callback will fire.
			}
		}
	);

	return machineStateAtom;
}
