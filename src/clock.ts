// Time is injected so tests can control it instead of sleeping.
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
