def fibonacci(n: int) -> int:
    """
    Calculates the nth Fibonacci number iteratively.

    F(0) = 0
    F(1) = 1
    F(n) = F(n-1) + F(n-2)
    """
    if not isinstance(n, int) or n < 0:
        raise ValueError("Input must be a non-negative integer.")
    
    if n == 0:
        return 0
    if n == 1:
        return 1
    
    # Initialize the first two numbers
    a, b = 0, 1
    
    # Start iteration from the 2nd number up to n
    for _ in range(2, n + 1):
        # Calculate the next number and shift the variables
        a, b = b, a + b
        
    return b

if __name__ == '__main__':
if __name__ == '__main__':
    while True:
        try:
            user_input = input("Enter the maximum index N for Fibonacci sequence (e.g., 10): ")
            N = int(user_input)
            
            if N < 0:
                print("Index must be non-negative.")
                continue
            
            print("\n--- Fibonacci Sequence up to Index {} ---".format(N))
            sequence = []
            for i in range(N + 1):
                sequence.append(str(fibonacci(i)))
            print(" -> ".join(sequence))
            
            break
        except ValueError:
            print("Invalid input. Please enter a whole number.")