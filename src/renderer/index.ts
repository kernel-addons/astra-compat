export default new class Package {
    public onStart(): void {
        console.log("Hey.");
    }

    public onStop(): void {
        console.log("Bye.");
    }
}