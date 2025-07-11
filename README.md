# jotai-robot3

👻🤖

Jotai integration helpers for [Robot3](https://thisrobot.life/) finite-state machines.

The API is heavily inspired by [`jotai-xstate`](https://github.com/jotaijs/jotai-xstate) and provides a familiar experience when working with Robot3 instead of XState.

## Installation

```bash
# npm
yarn add jotai jotai-robot3 robot3
# or
pnpm add jotai jotai-robot3 robot3
```

`jotai` and `robot3` are declared as peer dependencies so you can control the exact versions in your application.

## Usage

```ts
import { atomWithMachine, RESTART } from 'jotai-robot3';
import { createMachine, state, transition, reduce } from 'robot3';

// 1. Create a machine as usual with Robot3.
const counterMachine = createMachine(
	{
		inactive: state(transition('toggle', 'active')),
		active: state(
			transition(
				'toggle',
				'inactive',
				reduce((ctx) => ({ ...ctx, count: ctx.count + 1 }))
			)
		)
	},
	() => ({ count: 0 })
);

// 2. Wrap it in an atom.
export const counterAtom = atomWithMachine(() => counterMachine);
```

In React you can use the atom just like any other Jotai atom:

```tsx
const [state, send] = useAtom(counterAtom);

return (
	<button onClick={() => send('toggle')}>
		{state.current === 'inactive'
			? 'Activate'
			: `Clicked ${state.context.count}`}
	</button>
);
```

To restart the service and bring it back to its initial state you can send the special `RESTART` symbol:

```ts
send(RESTART);
```

## API Reference

### `atomWithMachine(getMachine, getInitialContext?)`

Creates a writable atom that manages the lifecycle of a Robot3 service.

• **getMachine** – A Robot3 machine or a function that receives a Jotai `Getter` and returns one. Using a getter makes it possible to derive the machine definition from other atoms.

• **getInitialContext** – _(optional)_ An object or getter function that is passed as `initialContext` when the machine is interpreted.

The returned atom behaves like so:

- **read** – Returns `service.machine` (kept in-sync with every transition).
- **write** – Forwards the event to `service.send()`.

### `RESTART`

A unique symbol that can be sent to the write function of an atom created by `atomWithMachine` to stop the current service instance and start a fresh one. Useful when you want to re-execute invokes that have resolved or when you need to reset context.

```ts
const [, send] = useAtom(counterAtom);

send(RESTART); // resets the machine
```

---

© MIT Licensed. See [LICENSE](LICENSE) for details.
