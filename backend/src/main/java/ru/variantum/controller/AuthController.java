package ru.variantum.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ru.variantum.dto.request.LoginRequest;
import ru.variantum.dto.request.RegisterRequest;
import ru.variantum.dto.response.UserResponse;
import ru.variantum.security.CurrentUser;
import ru.variantum.service.auth.AuthService;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
@Tag(name = "Auth")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody RegisterRequest req,
            HttpServletResponse response
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(req, response));
    }

    @PostMapping("/login")
    public UserResponse login(
            @Valid @RequestBody LoginRequest req,
            HttpServletResponse response
    ) {
        return authService.login(req, response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        authService.logout(response);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/refresh")
    public UserResponse refresh(HttpServletRequest request, HttpServletResponse response) {
        return authService.refresh(request, response);
    }

    @GetMapping("/me")
    public UserResponse me() {
        return authService.me(CurrentUser.requireId());
    }
}
